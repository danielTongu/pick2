# Pick 2 Software Documentation

## 1. Purpose and authority

This document defines the observable behavior, domain policies, contracts, and
maintenance rules for Pick 2. It is written for maintainers and contributors:
it explains what the software must do and where a policy belongs without
describing every private implementation detail.

The document is normative where it uses **MUST**, **MUST NOT**, **SHOULD**, or
**MAY**. When behavior changes, update this document, the README, the in-page
guide, and focused tests in the same change.

Pick 2 is a browser card game with Direct and Hosted modes. Both modes expose
the same Home and Room experiences, actions, core rules, response envelope, and
client data shape. The transport and persistence boundary differs by mode.

## 2. Product vocabulary

- **Home** is the room directory and room-creation experience.
- **Room** is both the active play/viewing page and the core domain object for
  one match.
- **Player** is a seated participant whose hand and turn state are private to
  that player where appropriate.
- **Viewer** is connected to a Room without occupying a player seat.
- **Bot** is an automated Player controlled by the host.
- **PlayerCircle** is the Room's turn-order structure. It owns circular player
  links, direction, and the nullable turn-owner cursor. It MUST NOT own room or
  player activity timestamps.
- **Host** is the authoritative coordinator for rooms, peers, actions,
  notifications, automated turns, and cleanup.

## 3. System boundaries

The application has two HTML entry points and four responsibility areas:

```text
index.html          Home page
room.html           Room page and in-page guide
core/               Domain rules, models, bots, and DTO mapping
runtime/            Client, Host, browser runtime, and Node hosted runtime
ui/                 Controllers, page state, elements, styles, and utilities
server.js           Node Network entry point
```

The UI translates user interaction into named actions and renders authoritative
snapshots. It MUST NOT implement a second copy of room rules or normalize
competing player DTO shapes.

The Host owns orchestration and authority. The core owns domain validity,
membership, turns, cards, idle state, and round state. `StateMapper` defines the
boundary between domain state and browser-safe data. Direct and Hosted hosts
MUST preserve these responsibilities even when their transports differ.

Direct mode connects `Client` directly to a browser-owned Host and uses browser
storage for custom room definitions. Hosted mode connects through a WebSocket
and uses the Node runtime's storage adapter. Hosted custom rooms do not
automatically receive bots; Direct custom rooms do according to the direct host
profile. Default rooms remain available according to the configured defaults.

## 4. Names and identity

Player and room names are user-facing identifiers, not arbitrary strings. A
valid name MUST:

- contain between 2 and 24 characters for a Player, or between 2 and 48
  characters for a Room;
- contain Unicode letters or numbers, with words separated only by spaces,
  apostrophes, curly apostrophes, or hyphens;
- have no leading or trailing whitespace;
- contain no symbols, control characters, repeated separator patterns, or
  separator-only content.

The accepted form is equivalent to:

```regex
^[\p{L}\p{N}]+(?:[ '\u2019-][\p{L}\p{N}]+)*$
```

Validation MUST occur at the user-facing boundary and again in the domain
model. Normalized player keys are lookup identifiers and may be more tolerant
than creation validation; a key MUST NOT be treated as proof that the original
display name was valid.

Player names MUST be unique within a Room. Room capacity applies only to
Players, not Viewers.

## 5. Room lifecycle and membership

### 5.1 Actions

The public action set is defined by `Constants`:

| Area | Actions |
| --- | --- |
| Directory and membership | `list`, `create`, `view`, `join`, `leave` |
| Play | `start`, `draw`, `discard`, `pass`, `declare` |

The Host MUST validate the Room and Player context for every action. A
client-provided name, tab identifier, or room key MUST NOT grant authority over
another participant or Room.

### 5.2 Membership rules

- `list` returns the Home directory.
- `create` creates a Room and joins its first Player.
- `view` opens an existing Room without taking a seat. A successful new viewer
  updates `Room.lastActiveAt`.
- `join` adds a Player and removes that tab from the viewer set when applicable.
  Joining is allowed only while the Room is waiting or finished, according to
  the host profile and current lifecycle rules. Joining updates both the new
  Player's activity and the Room's activity.
- `leave` removes the current participant and returns the client to Home.
- A Player may move to viewing state. This updates Room activity and refreshes
  idle monitoring for the remaining eligible Players.
- A Viewer may leave at any time. Removing a viewer updates Room activity only
  when a viewer was actually removed.

Starting requires at least two Players. In Direct mode, leaving an owned custom
Room ends that browser-owned Room and returns Home; configured default Rooms
remain available. A finished Direct Room may be restarted without creating a new
Room.

### 5.3 End-to-end flows

#### Entering a Room as a Player

1. The client loads Home and requests the current Room directory.
2. The user creates a Room or selects an existing Room to view.
3. The client navigates to the Room page and requests a Room snapshot.
4. The user submits a valid Player name. The Host verifies the Room, seat
   capacity, name uniqueness, and membership state.
5. The Room adds the Player, removes that tab from its viewer set, updates the
   Player and Room activity timestamps, and returns the updated Room snapshot.
6. The Host sends the Player welcome notification after the state response.
7. If the Room now satisfies the start requirement, the Player may start the
   round.

#### Viewing a Room

1. The client requests an existing Room without a Player name.
2. The Host registers the tab as a Viewer and returns the Room snapshot.
3. The Room updates `Room.lastActiveAt` when the tab becomes a new Viewer.
4. The Viewer may later join if membership is unlocked, or leave and return to
   Home without becoming a Player.

#### Starting and playing a round

1. A Player requests `start`; the Host verifies ownership and the minimum
   Player count.
2. The Room resets round state, shuffles and deals the cards, selects the
   initial discard and turn owner, changes to `playing`, records Room activity,
   and establishes idle monitoring.
3. The current human turn owner requests `draw`, `discard`, or `pass`.
4. The Room validates the action, applies its card and turn rules, updates the
   acting Player and Room activity, advances the turn when required, and
   refreshes monitoring.
5. The Host broadcasts the resulting Room snapshot. If the next turn belongs
   to a Bot, the Host continues the automated turn before returning to normal
   human interaction.
6. A suit-changing card changes the Room to `pending`; only its turn owner may
   declare the suit. Declaration returns the Room to `playing` and advances the
   turn.
7. When a round-ending condition occurs, the Room records winners and scores,
   changes to `finished`, and stops active-turn monitoring.

#### Idle Player and empty-room cleanup

1. The Host monitors only the eligible human Players defined in the activity
   policy. Monitoring is transferred whenever the Room state or turn owner
   changes.
2. When the monitored Player exceeds the idle duration, the Host moves that
   Player to viewing state, updates Room activity, and sends the affected client
   a warning together with the updated Room snapshot.
3. If no Players remain, the Host leaves the Room available during one grace
   interval and schedules a second empty-room check.
4. If a Player rejoins before the check, the Room remains available; when the
   check runs it observes that the Room is no longer empty and does not close
   it.
5. If the Room is still empty when the check expires, the Host unregisters and
   removes it, then sends affected Room clients a combined Home snapshot and
   `Room closed` warning. Those clients navigate to Home and display the
   warning.

#### Leaving and returning Home

1. A Player or Viewer requests `leave`, or the transport closes and the Host
   removes the client from its Room membership.
2. The Room removes the participant, recycles a departing Player's hand when
   applicable, updates Room activity, and refreshes idle monitoring.
3. The Host continues a Bot turn if the Room remains valid; otherwise it starts
   or performs empty-room cleanup.
4. The departing client receives Home state and no longer controls the Room.

#### Hosted reconnect

The Hosted client reports connection state separately from Room state. A
reconnecting browser MUST re-establish its endpoint before issuing Room actions
and MUST use a fresh authoritative snapshot rather than assuming that a prior
snapshot is still current. The Host remains the source of truth for
membership, turns, activity, and cleanup during the disconnect.

### 5.4 Room states

- **waiting**: no active turn is required; `turnOwnerKey` is null. Seated
  Players may perform the waiting-state actions allowed by the core rules.
- **playing**: ordinary turn order and card legality apply.
- **pending**: play is paused while the current turn owner declares a standard
  suit after a suit-changing card.
- **finished**: the round has ended and winners/scores are available.

State transitions MUST clear or establish the turn-owner cursor consistently.
Starting or resetting a round establishes a valid owner; returning to waiting
clears it.

## 6. Activity and idleness policy

### 6.1 Ownership of activity

`Player.lastActiveAt` measures activity for one seated Player. It is used to
decide whether that Player is idle. `Room.lastActiveAt` measures activity for
the Room and is used for room-level recency and empty-room cleanup.

`PlayerCircle` MUST NOT track activity. Turn order is not activity, and adding
timestamps to the circle would duplicate ownership and create inconsistent
state.

### 6.2 What updates activity

A successful Player action MUST update both the acting Player and the Room.
This includes drawing, discarding, passing, and declaring a suit. Starting or
resetting a round also establishes fresh activity for the relevant lifecycle.

Viewer activity MUST update only `Room.lastActiveAt`. A viewer becoming a
Player MUST update the new `Player.lastActiveAt` and `Room.lastActiveAt`.
Joining, leaving a viewer, and moving a Player to viewing state update Room
activity when the membership change actually occurs.

Failed actions MUST NOT be treated as successful Player activity. Internal
state-reset transitions may refresh timestamps when they establish a new
monitoring window; they MUST NOT introduce a separate circle timestamp.

### 6.3 Who is monitored

Hosted idle monitoring uses `Constants.MAX_IDLE_MS` (currently 30 seconds).
Bots are never monitored because the host advances automated turns promptly.

- While the Room is **playing** or **pending** and has a turn owner, only the
  current human turn owner is monitored.
- While the Room is **waiting**, every human Player is monitored.
- Players who are not eligible under the current state MUST have idle
  monitoring stopped.
- When the monitored set changes, each newly monitored Player begins a fresh
  idle window. Advancing a turn therefore transfers the monitoring window to
  the new human owner.

An idle human Player is demoted to viewing state, not silently deleted from the
Room interaction. The affected client MUST receive a warning notification. If
the demotion leaves the Room with no Players, the Host starts a grace-period
empty-room check for another `MAX_IDLE_MS`.

When the empty-room check expires and the Room is still empty, the Host MUST
close and unregister the Room. Direct mode disables automatic idle monitoring;
its lifecycle is owned by the browser page.

## 7. Game rules and round behavior

Starting creates and shuffles a deck, deals seven cards to each Player, chooses
a valid initial discard, and selects the first turn owner. The turn owner may
draw, discard, or pass only when the action is legal for the current state.

While playing, turn order, draw penalties, discard legality, skip/reverse
effects, and suit declarations are authoritative core rules. A suit-changing
ace moves the Room to pending until its owner declares a standard suit.

While waiting with no turn owner, the waiting-state permissions apply and
playing-only legality checks do not. A round finishes when a hand is emptied or
the seven of hearts ends the round under its rule. Remaining hand scores
determine the winner or tied winners.

Hand sorting is committed with the next draw, discard, or pass. Temporary
browser sorting is not a server-side action for every selection. Drawing resets
the temporary client sort to `none` so newly drawn cards are visibly distinct
until the Player sorts again.

All scoring MUST use the shared card-score policy in `Constants`; no UI or bot
may calculate a competing score.

## 8. Automated Players

Bots use the same legal action and card rules as human Players. Their strategy
MAY use their own cards, public turn order, visible hand counts, card effects,
and discard history. It MUST NOT inspect opponents' hidden card identities or
private hand scores.

Because discarded cards may return to the deck when the discard pile is
recycled, bot decisions MUST use the live public discard pile rather than a
permanent assumption that a discarded card is unavailable.

Bot heuristics may estimate responses, urgency, suit strength, and the value of
ending a round, but those estimates are subordinate to authoritative Room
legality. A strategy change requires focused tests for both the chosen behavior
and the unchanged legality boundary.

## 9. Client/server contract

Requests contain an action and data object. The client adds the per-tab
identifier and current temporary hand sort before sending. Room requests use
`data.roomName`; browser navigation uses:

```text
room.html?mode=<direct-or-hosted>&room=<room-name>
```

Responses use one envelope in both modes:

```js
{
    view: "home" | "room" | null,
    message: { status, title, message } | null,
    data: Object | null
}
```

`view` identifies the state destination. `data` is the authoritative snapshot.
`message` is an optional user-facing notification. A response MAY contain both
`data` and `message`; clients MUST process the state transition and notification
together rather than dropping the notice.

When a Room closes, affected Room clients receive Home data and a `Room closed`
warning with `No players remain.` They MUST navigate to Home and display that
warning. This is a single state transition, not a stale Room followed by a
separate best-effort redirect.

Home room summaries include `roomName`, `status`, `playerCount`, `playerLimit`,
`viewerCount`, `lastActiveAt`, and `createdAt`. Room data includes the same
metadata plus `localPlayerName`, circle turn data, discard pile, deck count,
winners, scores, and suit-selection state.

The browser-safe circle contains `players`, `playerLimit`, `turnOwnerKey`, and
`direction`. It MUST NOT contain `createdAt` or `lastActiveAt`. Each player DTO
has one stable shape with `key`, `name`, `hand`, `drawAllowance`, and
`isWinner`; card count is derived from `hand.cards.length`.

## 10. Notifications and failures

`UserNotification` is for expected, actionable conditions such as an invalid
name, full Room, illegal play, or acting out of turn. It becomes an
informational or warning notification suitable for the user.

Development failures, malformed contracts, impossible domain state, invalid
internal card values, and syntax or infrastructure defects MUST remain ordinary
errors. The runtime sends a generic server-error notification while preserving
the original error for logging and diagnosis. Do not convert a development
failure into `UserNotification` merely to avoid handling it.

The notification title contains the first meaningful statement. The message
body contains only the remaining detail, preventing duplicated opening text.

## 11. UI, accessibility, and presentation contracts

- The default CSS presentation is mobile-first.
- One `min-width: 721px` stage serves tablet and desktop layouts; do not add
  additional width breakpoints without documenting the need.
- Shared foundations belong in the appropriate base stylesheet. Table
  foundations belong in `ui/styles/table.css`.
- Hovered or keyboard-focused table rows use translucent cyan. A selected row
  uses solid cyan text without adding a background.
- Mutable UI state uses existing `data-*` hooks and `DomUtils.setBooleanState`.
- Non-decorative cards are keyboard and pointer flippable. Guide cards are not
  draggable. Only cards in the local Player's hand are discardable, and the
  discard-pile rectangle is the drop target.
- Viewers do not receive Player-only start or result overlays.
- When a local Player exists, displayed Player sequences begin with that Player
  while preserving circle order.
- Template paths MUST resolve through the shared UI root metadata so the same
  pages work from a repository root and from a GitHub Pages subpath. Current
  templates and styles live under `ui/`.

## 12. Testing and verification

Run `npm test` before completing a change. Use `npm run test:coverage` when
reviewing branch coverage. Focused tests belong at the lowest stable layer:

- `card.test.js`: constants, scoring, card rules, and shared client utilities;
- `collections.test.js`: deck, hand, sorting, and PlayerCircle behavior;
- `infrastructure.test.js`: serialization, state mapping, and throttling;
- `room.test.js`: membership, lifecycle, activity, idle monitoring, game flow,
  and bot choices;
- `user-notification.test.js`: expected versus developmental error handling;
- `local-game.test.js` and `network-connection.test.js`: page structure,
  routing, transport, and deployment-facing contracts.

Any change to activity policy MUST test Player and Room timestamps, monitored
human selection by lifecycle state, bot exclusion, demotion notification, and
empty-room closure. Any change to shared markup or CSS MUST be checked against
both `index.html` and `room.html`, including the mobile and 721px presentations.

## 13. Extension rules

1. Add shared actions, statuses, card values, timing, or scores to
   `core/Constants.js` first.
2. Put authoritative domain policy in `core/Room`, `core/Player`, or the
   relevant card model; keep coordination in `runtime/Host`.
3. Add or update the stable DTO in `core/StateMapper`; do not create parallel
   client shapes.
4. Validate Room, Player, Viewer, and ownership context in the Host before
   dispatching an action.
5. Reuse existing controller, template, validation, notification, sorting, and
   DOM-state patterns.
6. Preserve semantic markup, `data-*` state hooks, accessibility relationships,
   and the repository's CSS cascade standards.
7. Add tests for valid behavior, expected user failures, and important internal
   contract failures.
8. Update this document, the README, and the in-page guide whenever public
   behavior, policy, or operational behavior changes.

## 14. Operations

- Default Node port: `8080`; override with `PORT`.
- Health endpoint: `GET /health`.
- Node serves `/` from `index.html` and `/room.html` from `room.html`.
- Graceful shutdown handles `SIGINT` and `SIGTERM` and closes connections.
- Uncaught exceptions and unhandled promise rejections are logged and trigger
  Network shutdown because host state may be unsafe.
- The application is proprietary; see the README copyright and license notice.
