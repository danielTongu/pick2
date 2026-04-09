
# Pick2 – Full Technical Specification

## 1. Document Purpose

This document describes the current software architecture of **Pick2**, a real-time multiplayer card game built with Node.js, Express, and WebSockets.

It is intended to serve as:

- a developer onboarding guide
- a system architecture reference
- a runtime behavior specification
- a maintenance and extension guide

---

## 2. System Summary

Pick2 is a **server-authoritative multiplayer game**.

Clients do not own game state.  
Clients send commands.  
The server validates those commands.  
A room applies the rules and mutates state.  
The server then broadcasts a new snapshot.

### Core design model

- **Player** = actor
- **Room** = authority over room and game state
- **RoomServer** = transport, routing, registry, and communication

### High-level runtime path

```text
Browser Client
    ↓ WebSocket JSON message
RoomServer
    ↓ validated command dispatch
Room
    ↓ turn structure / state mutation
PlayerCircle
    ↓ participant objects
Player / AIPlayer
    ↓ card container / rule objects
Hand / Card
```

---

## 3. Design Goals

The current design aims to satisfy the following goals.

### 3.1 Deterministic game state
The room is the only authority that mutates game state.

### 3.2 Serialized mutation
Concurrent incoming commands must not corrupt room state.  
Room mutation is serialized through an internal async queue.

### 3.3 Strong separation of concerns
Networking, transport, routing, game rules, turn order, and player behavior are separated into different classes.

### 3.4 Abuse resistance
The system applies throttling to sockets, players, and rooms to reduce spam and abusive traffic.

### 3.5 Recoverable runtime behavior
Expected domain failures throw `UseCaseError` and are sent back to clients as controlled error messages.

---

## 4. Top-Level Architecture

## 4.1 Runtime Components

The current runtime is built from the following main classes:

- `RoomServer`
- `Room`
- `PlayerCircle`
- `Player`
- `AIPlayer`
- `Hand`
- `Card`
- `ThrottleGuard`
- `UseCaseError`

## 4.2 Dependency Direction

The core dependency direction is:

```text
RoomServer → Room → PlayerCircle → Player / AIPlayer → Hand → Card
```

Additional supporting dependencies:

```text
RoomServer → ThrottleGuard
Room / Player / Card / Hand → Constants
Room / Player / Card / Hand → Utilities
```

## 4.3 Ownership Summary

### RoomServer owns
- HTTP server
- WebSocket server
- room registry
- client/session registry
- inbound event routing
- outbound broadcasts
- room lifecycle decisions
- inactivity-removal reaction
- throttling integration

### Room owns
- players
- visitors
- deck
- discard pile
- room status
- winner list
- pending suit state
- mutation queue
- inactive-player sweep timer
- drain timer state

### PlayerCircle owns
- circular player order
- current-player pointer
- traversal direction
- iteration state

### Player owns
- identity
- hand
- draw allowance
- activity timestamp
- ring links
- optional tab/socket metadata

### AIPlayer owns
- automated turn choice
- automated suit choice

### Hand owns
- a collection of cards
- sort strategy
- efficient lookup index

### Card owns
- value
- suit
- score
- rotation
- rule-query behavior

---

## 5. Project Structure

Representative structure:

```text
pick2/
├── bin/
│   └── server.js
├── src/
│   ├── backend/
│   │   ├── Card.js
│   │   ├── Hand.js
│   │   ├── Player.js
│   │   ├── PlayerCircle.js
│   │   ├── Room.js
│   │   ├── RoomServer.js
│   │   ├── ThrottleGuard.js
│   │   └── UseCaseError.js
│   └── public/
│       ├── index.html
│       ├── images/
│       ├── scripts/
│       └── styles/
├── .env
├── nodemon.json
├── package.json
├── SPECS.md
└── README.md
```

---

## 6. Class Specifications

## 6.1 RoomServer

### Responsibility
`RoomServer` is the top-level application coordinator.

It is responsible for:
- starting the HTTP server
- starting the WebSocket server
- maintaining authoritative client sessions
- maintaining room registry
- parsing inbound messages
- routing commands
- invoking room APIs
- broadcasting snapshots
- reacting to inactive-player removal callbacks
- deciding room deletion and visitor draining

### Important invariants
- each `tabId` maps to at most one authoritative socket
- room state is never mutated directly by the server
- all game actions are delegated to `Room`

### Key private fields
- `#server`
- `#wss`
- `#pingIntervalId`
- `#roomsByKey`
- `#clientsByTabId`
- `#throttle`

### Session model
A connected tab is represented in the server registry as a `ClientEntry`.

Example shape:

```text
ClientEntry
- ws
- roomKey
- playerName
```

A client may be:
- not in any room
- a visitor in a room
- a player in a room

### Key methods
- `send(ws, type, payload)`
- `sendLobby(ws)`
- `#onMessage(ws, msg)`
- `#route(ws, type, payload)`
- `#createRoom(...)`
- `#visitRoom(...)`
- `#joinRoom(...)`
- `#exitRoom(...)`
- `#startGame(...)`
- `#fetchCard(...)`
- `#discardCard(...)`
- `#passTurn(...)`
- `#changeSuit(...)`
- `#broadcastRoomState(...)`
- `#handleInactivePlayerRemoved(...)`
- `#evaluateRoomState(...)`

---

## 6.2 Room

### Responsibility
`Room` is the authoritative owner of game state and room-local behavior.

### State owned by the room
- room name
- room capacity
- players
- visitors
- deck
- discard pile
- winners
- hand scores
- room status
- suit-pending flag
- drain timer
- inactive-player sweep timer

### Mutation model
All public mutation APIs are async and internally queued.

This is a core property of the room:

```text
public command
    ↓
#enqueue(...)
    ↓
private unlocked mutation
```

This avoids state corruption when multiple commands arrive close together.

### Key public APIs
- `addPlayerAsync(...)`
- `removePlayerAsync(...)`
- `reset()`
- `startGameAsync()`
- `stopGameAsync()`
- `handleDiscardAsync(...)`
- `handleFetchAsync(...)`
- `handlePassAsync(...)`
- `setSuitAsync(...)`
- `startInactivePlayerSweep(...)`
- `stopInactivePlayerSweep()`

### Important room-local automation
The room owns inactivity sweeps.

Behavior differs by room state:

#### If the room is actively playing
Only the **current player** is checked for inactivity.

#### If the room is not actively playing
All non-AI players are checked for inactivity.

When an inactive player is removed:
- they are removed from player order
- their cards return to the deck
- the deck is reshuffled
- their `tabId` is converted to a visitor entry
- the room fires `onInactivePlayerRemoved(player)`

### Why the room owns inactivity logic
Because inactivity rules depend on:
- room state
- turn state
- player type
- room-local mutation safety

Those are room concerns, not server concerns.

---

## 6.3 PlayerCircle

### Responsibility
`PlayerCircle` manages turn order over `Player` objects in a circular structure.

### Core responsibilities
- add players
- remove players
- maintain circular links
- move current player
- reverse direction
- peek future/previous players
- expose iteration

### Important invariants
When non-empty:
- each player has `next` and `prev`
- first.prev = last
- last.next = first

### Important note
`PlayerCircle` is not aware of:
- rooms
- deck/discard
- visitors
- sockets
- inactivity policies
- game rules

It is purely turn-order infrastructure.

---

## 6.4 Player

### Responsibility
`Player` represents a participant in the room.

### State owned by Player
- `name`
- `key`
- `drawAllowance`
- `timeLastActive`
- `hand`
- `isWinner`
- `tabId`
- `ws`
- circular links (`next`, `prev`)

### Important behaviors
- activity touch
- draw allowance management
- hand reset
- JSON serialization

### Human player model
Human players include `tabId` and `ws`.

---

## 6.5 AIPlayer

### Responsibility
`AIPlayer` extends `Player` and automates gameplay behavior.

### Main behaviors
- `takeTurn(room)`
- `chooseSuit(room)`

### Important rule
AI does not bypass the room.

AI still calls room APIs such as:
- `handleDiscardAsync(...)`
- `handleFetchAsync(...)`
- `handlePassAsync(...)`
- `setSuitAsync(...)`

That preserves room authority and keeps rules centralized.

---

## 6.6 Hand

### Responsibility
`Hand` manages a collection of `Card` objects.

### State owned by Hand
- card array
- id-to-index map
- sort strategy
- touch callback

### Core properties
- supports iteration
- supports score calculation
- supports efficient lookup by card id
- returns defensive copies for reads

### Guarantees
- duplicate cards are rejected
- lookup is optimized through `#indexById`
- `peekCard()` and `peekCards()` return copies, not internal references

### Key operations
- `addCard(value, suit)`
- `removeCard(value, suit)`
- `peekCard(value, suit)`
- `peekCards()`
- `hasCard(value, suit)`
- `setSortKey(sortKey)`
- `reset()`

### Important design note
The hand owns its own indexing and sort state, which keeps card-management logic localized and prevents repeated scanning elsewhere.

---

## 6.7 Card

### Responsibility
`Card` is the core domain representation for a playing card.

### State owned by Card
- `value`
- `suit`
- `score`
- `rotation`
- `type`

### Capabilities
- validate raw inputs
- derive score
- serialize to JSON
- render to DOM
- answer rule queries
- build/shuffle decks

### Rule-query methods
- `isTemporary()`
- `isEndGame()`
- `isDrawFour()`
- `isDrawTwo()`
- `isDrawCard()`
- `isAceOfSpades()`
- `isSuitChange()`
- `isWild()`
- `isSpecial()`
- `isSkip(numPlayers)`
- `isReverse(numPlayers)`
- `endsGameMove(remaining)`
- `isLegalOn(topDiscard, drawAllowance)`

### Static helpers
- `fromAny(...)`
- `fromCard(...)`
- `fromObject(...)`
- `idFrom(value, suit)`
- `createDeck(shuffled)`
- `shuffleDeck(deck)`

### Important design note
Card contains rule-query logic because card-specific behaviors belong closest to the card domain itself.

---

## 6.8 ThrottleGuard

### Responsibility
`ThrottleGuard` applies anti-abuse rate limiting.

### Supported scopes
- socket throttle
- player throttle
- room throttle

### Why it exists
Without throttling, clients could:
- spam fetch
- spam discard
- spam room joins/creates
- overload room/game handlers

### Important design note
Throttling is a transport/server concern, not a room/game-rule concern.

---

## 6.9 UseCaseError

### Responsibility
Represents controlled domain failures.

### Usage
Used for expected application errors such as:
- invalid message
- invalid session
- invalid suit
- room not found
- player not found
- game already started
- insufficient deck
- illegal operations

### Why it exists
This allows the server to:
- distinguish user-caused failures from internal failures
- return clean user-visible error messages
- avoid crashing on bad input

---

## 7. Runtime Control Flow

## 7.1 Startup Flow

```text
RoomServer constructor
    → resolve port
    → create Express app
    → create HTTP server
    → create WebSocket server
    → create throttle guard
    → attach WebSocket handlers
    → start listening
    → initialize default rooms
```

### Default room initialization
```text
RoomServer.#initializeDefaultRooms()
    → create Room
    → assign onInactivePlayerRemoved callback
    → start room inactive sweep
    → add AI player
    → register room
```

---

## 7.2 Connection Flow

```text
Client connects
    ↓
RoomServer.#onConnection(ws)
    ↓
sendLobby(ws)
    ↓
attach:
    - message handler
    - close handler
    - error handler
```

A connection is not a room member until a room command is issued.

---

## 7.3 Inbound Message Flow

```text
Client message
    ↓
RoomServer.#onMessage(ws, msg)
    ↓
JSON.parse(...)
    ↓
validate type
    ↓
ThrottleGuard.enforceSocketThrottle(ws, type)
    ↓
RoomServer.#route(ws, type, payload)
```

If an error is thrown:
- `UseCaseError` → send error message to client
- unexpected error → send generic error and rethrow

---

## 8. Event Routing Model

## 8.1 Supported room membership events
- `ROOM_CREATE`
- `ROOM_VISIT`
- `ROOM_JOIN`
- `ROOM_EXIT`

## 8.2 Supported game events
- `GAME_START`
- `CARD_FETCH`
- `CARD_DISCARD`
- `PLAYER_PASS`
- `SUIT_CHANGE`

---

## 9. Sequence Diagrams

## 9.1 Room Creation

```text
Client
  → RoomServer.#onMessage
  → ThrottleGuard.enforceSocketThrottle
  → RoomServer.#route
  → RoomServer.#createRoom
      → validate tabId / roomName / playerName
      → enforcePlayerThrottle
      → new Room(...)
      → room.onInactivePlayerRemoved = callback
      → room.startInactivePlayerSweep()
      → room.addPlayerAsync(...)
          → Room.#enqueue(...)
          → PlayerCircle.addPlayer(...)
      → RoomServer.#setClientMembership(...)
      → RoomServer.#broadcastRoomState(...)
```

---

## 9.2 Join Room

```text
Client
  → RoomServer.#joinRoom
      → validate client/tab
      → enforcePlayerThrottle
      → Room.addPlayerAsync(...)
          → Room.#enqueue(...)
          → PlayerCircle.addPlayer(...)
      → Room.removeVisitor(tabId)
      → RoomServer.#setClientMembership(...)
      → RoomServer.#broadcastRoomState(...)
```

---

## 9.3 Start Game

```text
Client
  → RoomServer.#startGame
      → require authoritative player
      → throttle player + room
      → Room.startGameAsync()
          → Room.#enqueue(...)
          → Room.#resetUnlocked()
          → choose start player
          → push initial discard
          → deal initial hands
          → set PLAYING
      → RoomServer.#broadcastRoomState(...)
      → RoomServer.#handleTurn(...)
```

---

## 9.4 Discard Flow

```text
Client
  → RoomServer.#discardCard
      → require authoritative player
      → throttle player + room
      → Utilities.toCardLike(payload.card)
      → Room.handleDiscardAsync(...)
          → Room.#enqueue(...)
          → Room.#handleDiscardUnlocked(...)
              → validate state
              → if not legal:
                    fetch instead
                else:
                    remove card from hand
                    push discard
                    apply card effect
      → RoomServer.#broadcastRoomState(...)
      → RoomServer.#handleTurn(...) if needed
```

---

## 9.5 AI Turn Flow

```text
RoomServer.#handleTurn(...)
    → current player is AIPlayer
    → AIPlayer.takeTurn(room)
        → think delay
        → choose action
        → room action async call
    → RoomServer.#broadcastRoomState(...)
    → RoomServer.#handleTurn(...) again
```

---

## 9.6 Inactive Player Removal

```text
Room inactive sweep timer
    ↓
Room.#sweepInactivePlayersAsync()
    ↓
Room.#enqueue(...)
    ↓
Room.#removeInactivePlayersUnlocked()
    ↓
remove player from PlayerCircle
    ↓
return cards to deck
    ↓
shuffle deck
    ↓
add tabId to visitors
    ↓
fire onInactivePlayerRemoved(player)
    ↓
RoomServer.#handleInactivePlayerRemoved(roomKey, player)
    ↓
update client membership:
    roomKey stays same
    playerName becomes null
    ↓
send inactivity message
    ↓
broadcast ROOM_VISIT snapshot
    ↓
evaluate room lifecycle
```

---

## 10. Room State Machine

Representative states:

- `WAITING`
- `PLAYING`
- `PENDING`
- `FINISHED`

## 10.1 WAITING
Room is idle or pre-game.

Allowed actions:
- add player
- remove player
- start game
- discard pre-game setup cards if applicable
- inactivity sweep checks all human players

## 10.2 PLAYING
Game is actively in progress.

Allowed actions:
- fetch
- discard
- pass
- AI turn execution
- inactivity sweep checks current player only

## 10.3 PENDING
Suit declaration is required.

Allowed actions:
- suit change
- AI suit resolution
- inactivity sweep checks current player only

## 10.4 FINISHED
Winner state exists and may be broadcast.

After broadcast, room may be reset to `WAITING` for replay flow.

---

## 11. Concurrency Model

## 11.1 Why a queue exists
Multiple WebSocket messages may arrive close together.

Without serialization:
- room state could be corrupted
- multiple turn changes could overlap
- illegal interleavings could occur

## 11.2 Mutation pattern
Every public room mutation method routes through `#enqueue`.

Pattern:

```text
public async command
    ↓
#enqueue(fn)
    ↓
serialized execution
    ↓
private unlocked mutation
```

## 11.3 Queue guarantees
- commands do not bounce on a lock
- commands execute in order
- one failing command does not poison the queue
- state remains internally consistent

---

## 12. Inactivity Policy

## 12.1 Policy Summary
Inactive human players are **demoted to visitors**, not sent directly to lobby.

## 12.2 Active-game policy
If room state is `PLAYING` or `PENDING`:
- only current player is checked

Rationale:
- active turn owner is the participant blocking progress

## 12.3 Inactive-game policy
If room state is not active:
- all non-AI players are checked

Rationale:
- waiting rooms should self-clean idle humans

## 12.4 Server reaction
The room reports removals; the server:
- updates session registry
- informs the client
- broadcasts room state
- decides whether room should later drain or delete

---

## 13. Room Lifecycle Policy

## 13.1 Room persists when players exist
If at least one player remains, room stays alive.

## 13.2 Room drains if only visitors remain
If room has no players but still has visitors:
- room remains alive temporarily
- one visitor is returned to lobby on each drain timer step

## 13.3 Room deletion
If room has neither players nor visitors:
- room is deleted
- timers are stopped
- throttling state is cleared

---

## 14. Data Model Summary

## 14.1 ClientEntry

```text
ClientEntry
- ws: WebSocket
- roomKey: string | null
- playerName: string | null
```

## 14.2 Room snapshot
Representative room snapshot includes:
- type
- name
- pCapacity
- state
- deck
- discardPile
- winnerNames
- handScores
- isAwaitingSuit
- numVisitors
- players (through PlayerCircle JSON)

## 14.3 Player JSON
Representative serialized player fields:
- key
- name
- drawAllowance
- timeLastActive
- hand
- isWinner

## 14.4 Hand JSON
Representative serialized hand fields:
- sortKey
- cards
- score
- size

## 14.5 Card JSON
Representative serialized card fields:
- value
- suit
- rotation

---

## 15. Network Protocol

## 15.1 Message format

```json
{
  "type": "event_name",
  "payload": {}
}
```

## 15.2 Example inbound events
- `room_create`
- `room_visit`
- `room_join`
- `room_exit`
- `game_start`
- `card_fetch`
- `card_discard`
- `player_pass`
- `suit_change`

## 15.3 Example outbound events
- `lobby_state`
- `room_state`
- `room_create`
- `room_visit`
- `room_join`
- `room_exit`
- `game_start`
- `card_fetch`
- `card_discard`
- `player_pass`
- `suit_change`
- `message`

---

## 16. Error Handling Strategy

## 16.1 Controlled errors
All expected user/domain failures throw `UseCaseError`.

Examples:
- invalid session
- invalid message
- room not found
- missing tabId
- invalid suit
- insufficient deck
- illegal state transition

## 16.2 Unexpected errors
Unexpected failures return a generic user message and are rethrown for visibility.

## 16.3 Benefit
This separates:
- business-rule failure
- infrastructure/runtime failure

---

## 17. Throttling Strategy

## 17.1 Socket throttle
Applied immediately in `#onMessage`.

Purpose:
- prevent raw inbound spam
- prevent malformed request flooding

## 17.2 Player throttle
Applied inside event handlers.

Purpose:
- prevent one player from spamming actions

## 17.3 Room throttle
Applied inside game handlers.

Purpose:
- prevent room-wide hot-loop abuse
- reduce repeated high-frequency room mutations

## 17.4 Why throttling stays out of Room
Throttling is not a game rule.  
It is a transport and anti-abuse concern.

---

## 18. Security and Trust Model

## 18.1 Server-authoritative rules
Clients do not decide:
- legality of moves
- room state transitions
- turn advancement
- deck state

## 18.2 Authoritative session validation
`tabId` and `ws` must match the authoritative client entry.

## 18.3 No trust in client payloads
All inbound data is validated:
- names
- room ids
- suits
- cards
- session ownership

## 18.4 Limited attack surface
The server:
- rejects invalid sessions
- throttles spam
- handles errors safely
- avoids trusting the browser as a source of truth

---

## 19. Operational Notes

## 19.1 Health check
The server exposes:

```text
/health
```

Expected response:

```text
OK
```

## 19.2 LAN testing
Server logs:
- localhost URL
- loopback URL
- LAN URLs for same-network testing

## 19.3 Default rooms
Default rooms are created at startup and seeded with AI.

---

## 20. Extension Guidance

## 20.1 Safe extension points
Recommended future additions:
- persistence layer
- reconnect/session recovery
- replay/history model
- matchmaking
- spectator mode
- analytics
- bot difficulty tiers

## 20.2 Where future persistence would belong
- room snapshots: persistence boundary around `Room`
- session persistence: server layer
- long-term stats: separate service/repository layer

## 20.3 Where not to add new logic
Avoid putting:
- transport logic into Room
- rule logic into RoomServer
- visitor logic into PlayerCircle
- throttling into Room

---

## 21. Maintainer Mental Model

Use this mental model when working on the project:

### RoomServer
**Receives, validates, routes, broadcasts, coordinates**

### Room
**Owns, decides, mutates, enforces**

### PlayerCircle
**Orders and moves players**

### Player
**Stores participant state**

### AIPlayer
**Chooses actions**

### Hand
**Owns card collection logic**

### Card
**Owns card semantics**

---

## 22. Final Summary

Pick2 is a server-authoritative multiplayer game architecture built on a clear separation of concerns.

### The essential system rule is:

- **Player acts**
- **Room decides**
- **Server communicates**

### The essential technical rule is:

- **All room mutation is serialized**
- **All client input is validated**
- **All important room automation stays inside Room**
- **All networking and lifecycle orchestration stays inside RoomServer**

This structure makes the system:

- deterministic
- maintainable
- testable
- extensible
- resistant to abuse
