/*****
 License
 --------------
 ISC License
 Copyright 2020 Khalil Stemmler
 Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 --------------
 ******/

import { shallowEqual } from "shallow-equal-object";

interface ValueObjectProps {
  [index: string]: any;
}

/**
 * @desc ValueObjects are objects that we determine their
 * equality through their structrual property.
 */

export abstract class ValueObject<T extends ValueObjectProps> {
  public readonly props: T;

  constructor (props: T) {
    this.props = Object.freeze(props);
  }

  public equals (vo?: ValueObject<T>) : boolean {
    if (vo === null || vo === undefined) {
      return false;
    }
    if (vo.props === undefined) {
      return false;
    }
    return shallowEqual(this.props, vo.props)
  }
}