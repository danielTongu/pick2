// Utilities.js
import {Constants} from "./Constants.js";

/**
 * Card-like shape used across rules, sorting, and DOM bridging.
 *
 * @typedef {Object} CardLike
 * @property {string} value - Card face value (e.g. "2", "k", "a", "joker", "").
 * @property {string} suit  - Card suit (e.g. "clubs", "hearts", "black").
 */

export class Utilities {

    /* ========================================  DOM UTILITIES =======================================================*/

    /**
     * Validates a CSS selector and DOM query scope.
     *
     * Ensures browser environment, selector correctness, and valid scope.
     *
     * @param {string} selector
     * @param {ParentNode} scope
     * @returns {{selector: string, scope: ParentNode}}
     * @throws {Error}
     * @private
     */
    static _validateSelectorAndScope(selector, scope) {
        let s = "";
        let sc = null;

        if (typeof document === "undefined" || typeof window === "undefined") {
            throw new Error("DOM operations unavailable outside browser.");
        }

        if (!scope) {
            scope = document;
        }

        if (typeof scope.querySelector !== "function" || typeof scope.querySelectorAll !== "function") {
            throw new Error("Invalid DOM scope for querying.");
        }

        if (typeof selector !== "string") {
            throw new Error("Selector must be a string.");
        }

        s = selector.trim();
        if (!s) {
            throw new Error("Selector cannot be empty.");
        }

        sc = scope;
        return {selector: s, scope: sc};
    }

    /**
     * Selects the first matching DOM element.
     *
     * @param {string} selector
     * @param {ParentNode} [scope=document]
     * @returns {Element|null}
     * @throws {Error}
     */
    static selectElement(selector, scope = document) {
        const check = this._validateSelectorAndScope(selector, scope);

        try {
            return check.scope.querySelector(check.selector);
        } catch {
            throw new Error("Invalid CSS selector: " + check.selector);
        }
    }

    /**
     * Selects all matching DOM elements.
     *
     * @param {string} selector
     * @param {ParentNode} [scope=document]
     * @returns {Element[]}
     * @throws {Error}
     */
    static selectAllElements(selector, scope = document) {
        const check = this._validateSelectorAndScope(selector, scope);

        try {
            return Array.from(check.scope.querySelectorAll(check.selector));
        } catch {
            throw new Error("Invalid CSS selector: " + check.selector);
        }
    }

    /* ========================================  GENERAL UTILITY =====================================================*/

    /**
     * Returns a random element from a non-empty array.
     *
     * @template T
     * @param {T[]} array
     * @returns {T}
     * @throws {Error}
     */
    static getRandomArrayElement(array) {
        if (!Array.isArray(array) || !array.length) {
            throw new Error("Array must be non-empty.");
        }

        const randomIndex = Math.floor(Math.random() * array.length);
        return array[randomIndex];
    }

    /**
     * Returns a random emoji from {@link Constants.EMOJIS}
     */
    static getRandomEmoji() {
        return Utilities.getRandomArrayElement(Constants.EMOJIS);
    }

    /**
     * Returns a random integer between min and max (inclusive).
     *
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    static getRandomInteger(min, max) {
        const imin = Math.ceil(min);
        const imax = Math.floor(max);
        return Math.floor(Math.random() * (imax - imin + 1)) + imin;
    }

    /**
     * Returns a trimmed string when the value is a string.
     *
     * @param {*} value - Value to trim when it is a string.
     * @returns {string} Trimmed string, or an empty string when the value is not a string.
     */
    static trimString(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    /**
     * Normalizes a name by requiring a non-empty string, validating it,
     * and returning the lowercase form.
     *
     * @param {*} name - Raw name input.
     * @param {string} label - Field label used in error messages.
     * @returns {string} Normalized lowercase name.
     * @throws {Error} When the value is empty or not a valid name.
     */
    static normalizeName(name, label) {
        const value = Utilities.requireNoneEmptyString(name, label);
        return Utilities.requireValidName(value, label).toLowerCase();
    }

    /**
     * Requires a non-empty string value.
     *
     * @param {*} str - Raw string input.
     * @param {string} label - Field label used in error messages.
     * @returns {string} Trimmed non-empty string.
     * @throws {Error} When the value is not a non-empty string.
     */
    static requireNoneEmptyString(str, label) {
        const value = Utilities.trimString(str);

        if (!value) {
            throw new Error(`${label} must be a non-empty string.`);
        }

        return value;
    }

    /**
     * Requires a valid name.
     *
     * @param {string} value - Name value to validate.
     * @param {string} label - Field label used in error messages.
     * @returns {string} The original value when valid.
     * @throws {Error} When the name is invalid.
     */
    static requireValidName(value, label) {
        if (!Utilities.isValidName(value)) {
            throw new Error(
                `${label} must be 2–20 characters and contain only letters, numbers, single spaces, underscores, or hyphens.`
            );
        }

        return value;
    }

    /**
     * Checks whether a name matches the allowed format.
     * Allowed characters are letters, numbers, underscores, hyphens,
     * and single spaces between segments.
     *
     * @param {string} value - Name value to validate.
     * @returns {boolean} True when the name is valid.
     */
    static isValidName(value) {
        return (
            typeof value === "string" &&
            value.length >= 2 &&
            value.length <= 20 &&
            /^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*$/.test(value)
        );
    }


    /* ========================================  CARD VALIDATION & ADAPTERS ==========================================*/

    /**
     * Validates that a card value/suit pair represents a legal card.
     *
     * Supports:
     * - Standard cards: values in {@link Constants.RANKS} excluding "joker", suits in {@link Constants.SUITS}
     * - Jokers: value "joker" with suit in {@link Constants.JOKER_SUITS}
     * - Placeholders: value "" with a standard suit
     *
     * @param {string} value
     * @param {string} suit
     * @throws {Error}
     */
    static validateCardAttributes(value, suit) {
        if (typeof suit !== "string" || typeof value !== "string") {
            throw new Error("Invalid card.");
        }

        const v = value.toLowerCase();
        const s = suit.toLowerCase();

        const isStandardSuit = s in Constants.SUITS;
        const isJokerSuit = s in Constants.JOKER_SUITS;
        const isPlaceholder = v === "" && isStandardSuit;

        if (!isPlaceholder && !(v in Constants.RANKS)) {
            throw new Error("Invalid value:" + value + ".");
        }

        if (!isStandardSuit && !isJokerSuit) {
            throw new Error("Invalid suit: " + suit + ".");
        }

        if (v === "joker" && !isJokerSuit) {
            throw new Error("Joker must be black/red.");
        }

        if (v !== "joker" && isJokerSuit) {
            throw new Error("Standard cards cannot use black/red.");
        }
    }

    /**
     * Checks whether a value structurally resembles a CardLike object.
     *
     * @param {any} obj
     * @returns {boolean}
     */
    static isCardLike(obj) {
        return (typeof obj === "object" && obj !== null && "value" in obj && "suit" in obj);
    }

    /**
     * Attempts to extract a CardLike from:
     * - Card instance
     * - plain object {value,suit}
     * - DOM `.card` element
     *
     * NOTE: Does NOT accept id strings.
     *
     * @param {any} source
     * @returns {CardLike|null}
     */
    static toCardLike(source) {
        let card = null;

        if (Utilities.isCardLike(source)) {
            card = {
                value: String(source.value),
                suit: String(source.suit)
            };
        } else if (typeof Element !== "undefined" && source instanceof Element) {
            card = Utilities.#readCardMetaFromCardElement(source);
        }

        return card;
    }

    /**
     * Requires a valid CardLike source and returns a normalized CardLike.
     *
     * @param {any} source
     * @returns {CardLike}
     * @throws {Error}
     */
    static requireCardLike(source) {
        const card = Utilities.toCardLike(source);

        if (card === null) {
            throw new Error("Expected Card-like object or card DOM element.");
        }

        Utilities.validateCardAttributes(card.value, card.suit);
        return card;
    }

    /**
     * Reads card metadata from a DOM `.card` element.
     *
     * Expected markup:
     * - container has class "card"
     * - contains `li[data-value][data-suit]`
     *
     * Allows placeholder value "" as long as suit is present.
     *
     * @param {Element} el
     * @returns {CardLike|null}
     * @private
     */
    static #readCardMetaFromCardElement(el) {
        let meta = null;

        if (el instanceof Element && el.classList.contains("card")) {
            const face = el.querySelector("li[data-value][data-suit]");
            if (face) {
                const value = String(face.dataset.value ?? "");
                const suit = String(face.dataset.suit ?? "");
                if (value && suit) {
                    meta = {value, suit};
                }
            }
        }
        return meta;
    }

    /* ================================  CARD ORDERING HELPERS =======================================================*/

    /**
     * Maps a card value to its numeric ranking using {@link Constants.RANKS}.
     *
     * @param {string} value
     * @returns {number} Rank value, or -1 if unknown.
     */
    static valueRank(value) {
        const key = String(value).toLowerCase();
        const ranked = Constants.RANKS[key];
        return typeof ranked === "number" ? ranked : -1;
    }

    /**
     * Maps a suit to its numeric ranking using {@link Constants.SUITS} and {@link Constants.JOKER_SUITS}.
     *
     * @param {string} suit
     * @returns {number} Rank value, or 0 if unknown.
     */
    static suitRank(suit) {
        const key = String(suit).toLowerCase();

        const standard = Constants.SUITS[key];
        if (typeof standard === "number") {
            return standard;
        }

        const joker = Constants.JOKER_SUITS[key];
        if (typeof joker === "number") {
            return joker;
        }

        return 0;
    }

    /**
     * Computes the game score for a card.
     *
     * @param {string} value
     * @param {string} suit
     * @returns {number}
     */
    static scoreCard(value, suit) {
        const v = String(value).toLowerCase();
        const s = String(suit).toLowerCase();
        let score;

        if (v === "") {
            score = 0;
        } else if (v === "2") {
            score = 20;
        } else if (v === "7") {
            score = s === "hearts" ? 25 : 7;
        } else if (v === "j") {
            score = 11;
        } else if (v === "q") {
            score = 12;
        } else if (v === "k") {
            score = 13;
        } else if (v === "a") {
            score = s === "spades" ? 60 : 15;
        } else if (v === "joker") {
            score = 40;
        } else {
            const parsed = parseInt(v, 10);
            score = Number.isFinite(parsed) ? parsed : 0;
        }

        return score;
    }

    /* ========================================  SORTING =============================================================*/

    /**
     * Comparator for CardLike sources.
     *
     * Sort behavior (always ascending):
     * - "score": score desc, tie-break suitRank desc, then valueRank desc
     * - "value": valueRank desc, tie-break suitRank desc
     * - "suit": suitRank desc, tie-break valueRank desc
     *
     * @param {any} a
     * @param {any} b
     * @param {"score"|"value"|"suit"} sortKey
     * @returns {number}
     */
    static compareCards(a, b, sortKey) {
        const A = Utilities.requireCardLike(a);
        const B = Utilities.requireCardLike(b);

        let result = 0;

        if (sortKey === "score") {
            const scoreA = Utilities.scoreCard(A.value, A.suit);
            const scoreB = Utilities.scoreCard(B.value, B.suit);

            result = scoreA - scoreB;

            if (result === 0) {
                result = Utilities.suitRank(A.suit) - Utilities.suitRank(B.suit);
            }
            if (result === 0) {
                result = Utilities.valueRank(A.value) - Utilities.valueRank(B.value);
            }
        } else if (sortKey === "value") {
            result = Utilities.valueRank(A.value) - Utilities.valueRank(B.value);

            if (result === 0) {
                result = Utilities.suitRank(A.suit) - Utilities.suitRank(B.suit);
            }
        } else if (sortKey === "suit") {
            result = Utilities.suitRank(A.suit) - Utilities.suitRank(B.suit);

            if (result === 0) {
                result = Utilities.valueRank(A.value) - Utilities.valueRank(B.value);
            }
        }

        return result;
    }

    static isValidSortKey(key) {
        return typeof key === "string" && Constants.SORT_KEYS.includes(key);
    }

    /**
     * Sorts DOM children inside a container by sortKey.
     * Non-cards are considered larger and come first (descending order).
     *
     * @param {HTMLElement} container
     * @param {"none"|"value"|"suit"|"score"} sortKey
     * @throws {Error}
     */
    static sortCardElementsInContainer(container, sortKey) {
        if (!(container instanceof HTMLElement)) {
            throw new Error("sortCardElementsInContainer: container must be an HTMLElement.");
        }

        const isNone = sortKey === Constants.SORT_KEYS[0];
        const isValidKey = Utilities.isValidSortKey(sortKey);

        if (!isNone && !isValidKey) {
            throw new Error("sortCardElementsInContainer: invalid sortKey: " + sortKey);
        }

        if (!isNone) {
            const children = Array.from(container.children);

            if (children.length >= 2) {
                children.sort(function comparator(a, b) {
                    return Utilities.compareElementsNonCardsFirstDesc(a, b, sortKey);
                });

                const fragment = document.createDocumentFragment();

                // append in reverse order to preserve DOM order
                for (let i = children.length - 1; i >= 0; i--) {
                    fragment.appendChild(children[i]);
                }
                container.appendChild(fragment);
            }
        }
    }

    /**
     * Descending order.
     * Non-cards are considered larger than cards, so they come first.
     *
     * @param {Element} a
     * @param {Element} b
     * @param {"value"|"suit"|"score"} sortKey
     * @returns {number}
     */
    static compareElementsNonCardsFirstDesc(a, b, sortKey) {
        const aCard = Utilities.toCardLike(a);
        const bCard = Utilities.toCardLike(b);

        if (!aCard && !bCard) {
            return 0;
        } else if (!aCard && bCard) {
            return 1; // a (non-card) before b
        } else if (aCard && !bCard) {
            return -1;  // b (non-card) before a
        } else {
            return Utilities.compareCards(aCard, bCard, sortKey);
        }
    }

    /**
     * Inserts a card-like item into an already-sorted list while maintaining descending order.
     *
     * Supported list items and inserted item:
     * - Card instance
     * - plain object {value, suit}
     * - DOM `.card` element
     *
     * @param {any[]} list
     * @param {any} card
     * @param {"none"|"value"|"suit"|"score"} sortKey
     * @returns {number} Inserted index
     * @throws {Error}
     */
    static insertSorted(list, card, sortKey) {
        if (!Array.isArray(list)) {
            throw new Error("insertSorted: list must be an array.");
        }

        if (!Utilities.isValidSortKey(sortKey)) {
            throw new Error("insertSorted: invalid sortKey: " + sortKey);
        }

        let index = list.length - 1;

        if (sortKey === "none") {
            list.push(card); // No sorting requested → append
        } else {
            // Validate incoming card strictly
            const incoming = Utilities.requireCardLike(card);

            let low = 0;
            let high = list.length;

            // Binary search over the entire list.
            // Assumes the list is already sorted according to compareCards.
            while (low < high) {
                const mid = (low + high) >>> 1;

                // Existing items must be card-like by contract
                const midCard = Utilities.requireCardLike(list[mid]);
                const cmp = Utilities.compareCards(incoming, midCard, sortKey);

                // Descending order
                if (cmp > 0) {
                    high = mid;
                } else {
                    low = mid + 1;
                }
            }
            list.splice(low, 0, card);

            index = low;
        }

        return index;
    }

    /* ========================================  MISC ================================================================*/

    /**
     * Checks whether a key is a supported sort key.
     *
     * @param {string} key
     * @returns {boolean}
     */
    static isSortableKey(key) {
        return (typeof key === "string") && Constants.SORT_KEYS.includes(key.trim().toLowerCase());
    }

    /**
     * Removes all children from a container except the one matching an ID.
     *
     * @param {HTMLElement} container
     * @param {string} [exceptionId]
     * @throws {Error}
     */
    static clearContainerExcept(container, exceptionId) {
        if (!(container instanceof HTMLElement)) {
            throw new Error("clearContainerExcept: container must be a valid HTMLElement.");
        }

        const children = container.children;

        for (let i = children.length - 1; i >= 0; i--) {
            const child = children[i];

            if (!exceptionId || child.id !== exceptionId) {
                container.removeChild(child);
            }
        }
    }
}
