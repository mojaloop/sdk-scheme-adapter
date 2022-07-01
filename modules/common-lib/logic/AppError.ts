/*****
 License
 --------------
 ISC License
 Copyright 2020 Khalil Stemmler
 Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 --------------
 ******/

import { Result } from "./Result";
import { UseCaseError } from "./UseCaseError";

export namespace GenericAppError {
  export class UnexpectedError extends Result<UseCaseError> {
    public constructor (err: any) {
      super(false, {
        message: `An unexpected error occurred.`,
        error: err
      } as UseCaseError)
      console.log(`[AppError]: An unexpected error occurred`);
      console.error(err);
    }

    public static create (err: any): UnexpectedError {
      return new UnexpectedError(err);
    }
  }
}