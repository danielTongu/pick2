"use strict";

export class UseCaseError extends Error {
    constructor(message, code = "UseCaseError") {
        super(message);
        this.name = "UseCaseError";
        this.code = code;
        Error.captureStackTrace?.(this, UseCaseError);
    }
}
