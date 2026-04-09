/**
 * Centralized application-wide constants.
 *
 * This module defines immutable configuration values and canonical domains
 * used by validation, sorting, scoring, networking, and UI layers.
 *
 * All members are static and must be treated as read-only.
 */
export class Constants {

    /* ========================================  GENERAL CONFIG =====================================================*/
    static MAX_IDLE_MS = 15 * 1000; // 30 seconds

    /**
     * Initial number of cards dealt to a player.
     * @type {number}
     */
    static PLAYER_INIT_NUM_CARDS = 7;

    /**
     * Maximum number of players allowed in a room.
     * @type {number}
     */
    static ROOM_PLAYER_CAPACITY = 4;

    /**
     * List of default room identifiers created at startup.
     * @type {string[]}
     */
    static DEFAULT_ROOMS = [
        "Default-R0",
        "Default-R1",
        "Default-R2",
        "Default-R3",
    ];

    /**
     * Emoji set used for UI reactions or decoration.
     * @type {string[]}
     */
    static EMOJIS = ["😂", "🤣", "😈", "👿", "😝", "🙃", "🤪", "😜"];

    /* ========================================  CARD DOMAIN ========================================================*/

    /**
     * Supported sort keys for card collections.
     *
     * @returns {readonly string[]}
     */
    static get SORT_KEYS() {
        return ["none", "value", "suit", "score"];
    }

    /**
     * Standard (non-joker) suits only.
     *
     * Keys represent valid suit identifiers.
     * Values represent suit ordering (ascending).
     *
     * @returns {Readonly<Record<string, number>>}
     */
    static get SUITS() {
        return Object.freeze({
            clubs: 1,
            diamonds: 2,
            hearts: 3,
            spades: 4
        });
    }

    /**
     * Joker suit/color identifiers.
     *
     * Kept separate from {@link SUITS} to prevent pairing joker colors
     * with standard values.
     *
     * @returns {Readonly<Record<string, number>>}
     */
    static get JOKER_SUITS() {
        return Object.freeze({
            black: 5,
            red: 6
        });
    }

    /**
     * Card value rankings (includes joker; excludes blank placeholder).
     *
     * Keys represent valid card values.
     * Values represent value ordering (ascending).
     *
     * @returns {Readonly<Record<string, number>>}
     */
    static get RANKS() {
        return Object.freeze({
            "2": 2, "3": 3, "4": 4, "5": 5, "6": 6,
            "7": 7, "8": 8, "9": 9, "10": 10,
            "j": 11, "q": 12, "k": 13, "a": 14,
            "joker": 15
        });
    }

    /* ========================================  STATES & EVENTS ====================================================*/
    static get DATA_TYPES() {
        return Object.freeze({
            LOBBY: "Lobby",
            ROOM: "Room",
            PLAYER: "Player",
            Card: "Card"
        });
    }


    /**
     * Canonical lifecycle and system states.
     *
     * @returns {Readonly<Record<string, string>>}
     */
    static get STATUSES() {
        return Object.freeze({
            WAITING: "waiting",
            PLAYING: "playing",
            FINISHED: "finished",
            PENDING: "pending",
            LOCKED: "locked",
            OPEN: "open",
            CLOSING: "closing",
            CLOSED: "closed",
            CONNECTED: "connected",
            DISCONNECTED: "disconnected",
            ERROR: "error",
            WARNING: "warning"
        });
    }

    /**
     * Standardized event names for client-server communication.
     *
     * @returns {Readonly<Record<string, string>>}
     */
    static get EVENTS() {
        return Object.freeze({
            ROOM_EXIT: "exit",
            MESSAGE: "message",
            LOBBY_STATE: "lobby_state",
            ROOM_STATE: "room_state",
            ROOM_CREATE: "room_create",
            ROOM_VISIT: "room_visit",
            ROOM_LEAVE: "room_leave",
            ROOM_JOIN: "room_join",
            PLAYER_QUIT: "player_quit",
            PLAYER_PASS: "player_pass",
            GAME_START: "game_start",
            GAME_STOP: "game_over",
            SUIT_CHANGE: "suit_change",
            CARD_FETCH: "card_fetch",
            CARD_DISCARD: "card_discard"
        });
    }
}