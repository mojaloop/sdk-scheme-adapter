/******************************************************************************
 *  Copyright 2019 ModusBox, Inc.                                             *
 *                                                                            *
 *  info@modusbox.com                                                         *
 *                                                                            *
 *  Licensed under the Apache License, Version 2.0 (the "License");           *
 *  you may not use this file except in compliance with the License.          *
 *  You may obtain a copy of the License at                                   *
 *  http://www.apache.org/licenses/LICENSE-2.0                                *
 *                                                                            *
 *  Unless required by applicable law or agreed to in writing, software       *
 *  distributed under the License is distributed on an "AS IS" BASIS,         *
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  *
 *  See the License for the specific language governing permissions and       *
 *  limitations under the License                                             *
 ******************************************************************************/

/* Example
 * 
 * This is an example Jest test for the MathLib example module.
 * 
 */

import MathLib from "../../src/index";
jest.mock('../../src/server');

describe ('MathLib', () => {
  describe("test add function", () => {
    it("should return 15 for add(10,5)", () => {
      expect(MathLib.add(10, 5)).toEqual(15);
    });
  
    it("should return 5 for add(2,3)", () => {
      expect(MathLib.add(2, 3)).toEqual(5);
    });
  });

  describe("test mul function", () => {
    it("should return 15 for mul(3,5)", () => {
      expect(MathLib.mul(3, 5)).toEqual(15);
    });
  });
})
