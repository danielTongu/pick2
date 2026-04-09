// Card.js
import {Constants} from "../public/scripts/Constants.js";
import {Utilities} from "../public/scripts/Utilities.js";

/**
 * Card representation used across deck, rules, and UI.
 */
export class Card {

    /**
     * Creates a new card with validated attributes and derived metadata.
     *
     * @param {string} value
     * @param {string} suit
     * @throws {Error}
     */
    constructor(value, suit) {
        Utilities.validateCardAttributes(value, suit);
        this.type = Constants.DATA_TYPES.Card;

        /** @type {string} */
        this.value = String(value).toLowerCase();

        /** @type {string} */
        this.suit = String(suit).toLowerCase();

        /** @type {number} */
        this.score = Utilities.scoreCard(this.value, this.suit);

        /** @type {number} */
        this.rotation = Utilities.getRandomInteger(-60, 60);
    }

    /**
     * Creates a Card from any supported source (no circular dependency):
     * - Card instance
     * - Plain object {value,suit,(rotation?)}
     * - DOM `.card` element
     *
     * Uses Utilities to normalize/validate objects/elements without Utilities importing Card.
     *
     * @param {any} source
     * @returns {Card}
     * @throws {Error}
     */
    static fromAny(source) {
        if (source instanceof Card) {
            return Card.fromCard(source);
        }

        const c = Utilities.requireCardLike(source);
        const card = new Card(c.value, c.suit);

        // Preserve rotation if present on the source (plain object, DOM adapter, etc.)
        if (source && typeof source.rotation === "number" && !Number.isNaN(source.rotation)) {
            card.setRotation(source.rotation);
        }

        return card;
    }

    /**
     * Copies an existing Card into a new Card instance.
     *
     * @param {Card} other
     * @returns {Card}
     * @throws {Error}
     */
    static fromCard(other) {
        if (!(other instanceof Card)) {
            throw new Error("Can only copy from another Card.");
        }

        const copy = new Card(other.value, other.suit);
        copy.setRotation(other.rotation);
        // Keep score canonical (in case rules ever change)
        copy.score = Utilities.scoreCard(copy.value, copy.suit);
        return copy;
    }

    /**
     * Creates a Card from raw fields.
     *
     * @param {string} value
     * @param {string} suit
     * @param {number|null} [rotation=null]
     * @returns {Card}
     * @throws {Error}
     */
    static fromObject(value, suit, rotation = null) {
        const card = new Card(value, suit);

        if (rotation !== null && rotation !== undefined) {
            card.setRotation(rotation);
        }

        return card;
    }

    /**
     * Creates a stable string ID for a value/suit pair.
     * (For display/logging/keys. Utilities do not accept IDs as input by design.)
     *
     * @param {string} value
     * @param {string} suit
     * @returns {string}
     * @throws {Error}
     */
    static idFrom(value, suit) {
        Utilities.validateCardAttributes(value, suit);
        return `${String(value).toLowerCase()}-${String(suit).toLowerCase()}`;
    }

    /**
     * Returns the stable ID for this card.
     *
     * @returns {string}
     */
    getId() {
        return Card.idFrom(this.value, this.suit);
    }

    /**
     * Stringifies the card as its stable id.
     *
     * @returns {string}
     */
    toString() {
        return this.getId();
    }

    /**
     * JSON serialization payload.
     * Useful for saving/restoring without leaking class internals.
     *
     * @returns {{value:string,suit:string,rotation:number}}
     */
    toJSON() {
        return {value: this.value, suit: this.suit, rotation: this.rotation};
    }

    /**
     * Sets the card's UI rotation.
     *
     * @param {number} rotation
     * @throws {Error}
     */
    setRotation(rotation) {
        if (typeof rotation !== "number" || Number.isNaN(rotation)) {
            throw new Error("Card.rotation must be a valid number.");
        }
        this.rotation = rotation;
    }

    /**
     * Creates a Card DOM element for UI rendering.
     * The `li` holds the `data-value` and `data-suit` attributes.
     *
     * @returns {HTMLElement}
     */
    toHTML() {
        const rootElement = document.createElement("ul");
        const faceElement = document.createElement("li");
        const faceContent = document.createElement("span");

        rootElement.classList.add("card");
        rootElement.appendChild(faceElement);

        faceElement.dataset.value = this.value;
        faceElement.dataset.suit = this.suit;

        faceElement.appendChild(faceContent);
        return rootElement;
    }

    /* ======================================== RULE QUERIES (INSTANCE) ========================================= */

    /** @returns {boolean} */
    isTemporary() {
        return this.value === "";
    }

    /** @returns {boolean} */
    isEndGame() {
        return this.value === "7" && this.suit === "hearts";
    }

    /** @returns {boolean} */
    isDrawFour() {
        return this.value === "joker";
    }

    /** @returns {boolean} */
    isDrawTwo() {
        return this.value === "2";
    }

    /** @returns {boolean} */
    isDrawCard() {
        return this.isDrawFour() || this.isDrawTwo();
    }

    /** @returns {boolean} */
    isAceOfSpades() {
        return this.value === "a" && this.suit === "spades";
    }

    /** @returns {boolean} */
    isSuitChange() {
        return this.value === "a" && this.suit !== "spades";
    }

    /** @returns {boolean} */
    isWild() {
        return this.isDrawFour() || this.isAceOfSpades();
    }

    /** @returns {boolean} */
    isSpecial() {
        return this.isEndGame() ||
            this.value === "2" ||
            this.value === "8" ||
            this.value === "j" ||
            this.value === "a" ||
            this.value === "joker";
    }

    /**
     * @param {number} numPlayers
     * @returns {boolean}
     */
    isSkip(numPlayers) {
        return this.value === "8" || (this.value === "j" && numPlayers === 2);
    }

    /**
     * @param {number} numPlayers
     * @returns {boolean}
     */
    isReverse(numPlayers) {
        return this.value === "j" && numPlayers > 2;
    }

    /**
     * @param {number} remaining
     * @returns {boolean}
     */
    endsGameMove(remaining) {
        return remaining === 0 || this.isEndGame();
    }

    /**
     * Checks whether this card is legal to play on the given discard.
     *
     * @param {any} topDiscard - CardLike source or null.
     * @param {number} drawAllowance
     * @returns {boolean}
     * @throws {Error}
     */
    isLegalOn(topDiscard, drawAllowance) {
        let valid = true;

        if (topDiscard) {
            const top = Utilities.requireCardLike(topDiscard);
            valid = this.#compatibleWith(top);

            if (drawAllowance > 1) {
                const topScore = Utilities.scoreCard(top.value, top.suit);
                valid = this.score >= topScore;
            }
        }

        return valid;
    }

    /**
     * Compatibility check against another CardLike according to game rules.
     *
     * @param {any} other
     * @returns {boolean}
     * @throws {Error}
     * @private
     */
    #compatibleWith(other) {
        const o = Utilities.requireCardLike(other);

        return this.value === o.value ||
            this.suit === o.suit ||
            this.isWild() ||
            (o.value === "joker") ||
            (o.value === "a" && o.suit === "spades") ||
            (this.isTemporary() && o.value === "a") ||
            (o.value === "" && this.value === "a");
    }

    /* ======================================== DECK HELPERS ===================================================== */

    /**
     * Creates a full deck according to the canonical domain definitions in Constants.
     *
     * @param {boolean} [shuffled=true]
     * @returns {Card[]}
     * @throws {Error}
     */
    static createDeck(shuffled = true) {
        const deck = [];
        const standardSuits = Object.keys(Constants.SUITS);
        const values = Object.keys(Constants.RANKS);

        for (const suit of standardSuits) {
            for (const value of values) {
                if (value !== "joker") {
                    deck.push(new Card(value, suit));
                }
            }
        }

        deck.push(new Card("joker", "black"));
        deck.push(new Card("joker", "red"));

        if (shuffled) {
            Card.shuffleDeck(deck);
        }

        return deck;
    }

    /**
     * Shuffles a deck of cards in-place using Fisher–Yates.
     *
     * @param {Card[]} deck
     * @throws {Error}
     */
    static shuffleDeck(deck) {
        if (!Array.isArray(deck)) {
            throw new Error("Deck must be array.");
        }

        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }
    }
}
