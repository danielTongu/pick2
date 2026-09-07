"use strict";

import { PageState } from "../PageState.js";
import { Constants } from "../../core/Constants.js";
import { DomUtils } from "../utilities/DomUtils.js";
import { ViewController } from "./ViewController.js";

/** Performs one short-lived WebSocket availability check. */
class NetworkProbe {
    #networkUrl;
    #socket = null;
    #timer = null;
    #resolve = null;
    #isSettled = false;

    /** @param {string} networkUrl - WebSocket URL to probe. */
    constructor(networkUrl) {
        this.#networkUrl = networkUrl;
    }

    /** @returns {Promise<boolean>} Whether the endpoint accepted a connection. */
    check() {
        return new Promise(this.#start.bind(this));
    }

    #start(resolve) {
        this.#resolve = resolve;
        this.#timer = globalThis.setTimeout(
            this.#handleTimeout.bind(this),
            Constants.NETWORK_CONNECTION_TIMEOUT_MS
        );

        try {
            this.#socket = new WebSocket(this.#networkUrl);
            this.#socket.addEventListener("open", this.#handleOpen.bind(this), {once: true});
            this.#socket.addEventListener("error", this.#handleError.bind(this), {once: true});
        } catch (_error) {
            this.#finish(false);
        }
    }

    #handleOpen() {
        this.#finish(true);
    }

    #handleError() {
        this.#finish(false);
    }

    #handleTimeout() {
        this.#finish(false);
    }

    #finish(isAvailable) {
        if (this.#isSettled) {
            return;
        }

        this.#isSettled = true;

        if (this.#timer !== null) {
            globalThis.clearTimeout(this.#timer);
            this.#timer = null;
        }

        this.#socket?.close();
        this.#resolve(isAvailable);
    }
}

/** Controls the embedded Network-mode connection view. */
export class NetworkConnectionController extends ViewController {
    /** @type {HTMLElement} */
    #connectionStatus;

    /** @type {HTMLElement} */
    #messageOutput;

    /** @type {HTMLInputElement} */
    #originInput;

    /** @type {HTMLButtonElement} */
    #connectButton;

    /** @type {HTMLFormElement} */
    #form;

    /** @type {string|null} */
    #configuredUrl = null;

    /** @type {string|null} */
    #currentHostUrl = null;

    /** @type {string} */
    #configurationError = "";

    /** @type {Function|null} */
    #connectedHandler = null;

    /** @type {number} */
    #attempt = 0;

    constructor() {
        super("#network-connection-view");
        this.#connectionStatus = DomUtils.require("#connection-status", HTMLElement);
        this.#messageOutput = DomUtils.require("#network-connection-message", HTMLElement);
        this.#originInput = DomUtils.require("#network-connection-origin", HTMLInputElement);
        this.#connectButton = DomUtils.require("#network-connection-connect-button", HTMLButtonElement);
        this.#form = DomUtils.require("#network-connection-form", HTMLFormElement);
    }

    /** Binds the connection actions. */
    /** Binds the editable host form. */
    initialize() {
        this.#form.addEventListener("submit", this.#handleSubmit.bind(this));
    }

    /** Connects to the address entered by the user. */
    #handleSubmit(event) {
        event.preventDefault();
        const origin = this.#originInput.value.trim();

        if (origin === "") {
            void this.connect(null);
            return;
        }

        try {
            void this.connect(PageState.resolveHostedUrl(origin));
        } catch (error) {
            this.render(
                "error",
                origin,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /** @param {Function} handler - Verified-host callback. */
    /** @param {Function} handler - Callback invoked after a successful probe. */
    setConnectedHandler(handler) {
        this.#connectedHandler = handler;
    }

    /** Cancels the active connection attempt. */
    /** Cancels the connection view and returns control to Home. */
    cancel() {
        this.#attempt += 1;
    }

    /** @param {string|null} preferredUrl - Optional single host to retry. @returns {Promise<boolean>} Whether a host is available. */
    async connect(preferredUrl) {
        const attempt = ++this.#attempt;
        this.#resolveHosts();
        const candidates = preferredUrl === null
            ? [...new Set([this.#configuredUrl, this.#currentHostUrl].filter(Boolean))]
            : [preferredUrl];

        if (candidates.length === 0) {
            this.render("unconfigured", "", "");
            return false;
        }

        for (const networkUrl of candidates) {
            this.render("connecting", networkUrl, "");
            const isAvailable = await NetworkConnectionController.#check(networkUrl);

            if (attempt !== this.#attempt) {
                return false;
            }

            if (isAvailable) {
                this.render("connected", networkUrl, "");
                this.#connectedHandler?.(networkUrl);
                return true;
            }
        }

        this.render("error", candidates.at(-1), this.#configurationError);
        return false;
    }

    /** @param {string} networkUrl - WebSocket URL to check. */
    static #check(networkUrl) {
        return new NetworkProbe(networkUrl).check();
    }

    /** Resolves the optional configured host and the host serving this page. */
    #resolveHosts() {
        const configuredOrigin = PageState.getConfiguredServerOrigin();
        this.#configuredUrl = null;
        this.#configurationError = "";

        if (configuredOrigin !== null) {
            try {
                this.#configuredUrl = PageState.resolveHostedUrl(configuredOrigin);
            } catch (error) {
                this.#configurationError = error instanceof Error
                    ? error.message
                    : String(error);
            }
        }

        try {
            this.#currentHostUrl = PageState.getCurrentHostUrl();
        } catch (_error) {
            this.#currentHostUrl = null;
        }
    }

    /**
     * Renders one connection state.
     *
     * @param {"connecting"|"reconnecting"|"connected"|"disconnected"|"error"|"unconfigured"} status - State to render.
     * @param {string} origin - Configured server address.
     * @param {string} detail - Optional error detail.
     */
    /** Renders connection status and diagnostic text. @param {string} status @param {string} origin @param {string} detail */
    render(status, origin, detail) {
        const statusLabel = {
            connecting: "connecting",
            reconnecting: "reconnecting",
            connected: "connected",
            disconnected: "disconnected",
            error: "connection error",
            unconfigured: "not configured"
        }[status];

        this.root.dataset.status = status;
        this.#connectionStatus.dataset.status = status;
        this.#connectionStatus.setAttribute("aria-label", `Connection mode. Network ${statusLabel}.`);
        this.#messageOutput.dataset.detail = detail || "";
        if (origin !== "") {
            this.#originInput.value = origin;
        }
        const isPending = status === "connecting" || status === "reconnecting";
        this.#connectButton.disabled = isPending;
        this.#connectButton.textContent = isPending ? "Connecting…" : "Connect to host";
    }
}
