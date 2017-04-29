/*!
 Copyright (C) 2017 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */

(function (GGRC) {
  'use strict';

  /**
   * Util methods for Models.
   */
  GGRC.Utils.Model = (function () {
    var changeCount = {};

    /**
     * Detect how much objects of specified type were changed.
     * Please note that this count may be incorrect (EXPERIMENTAL).
     * @param {String} model - The model name
     * @return {Integer} True or False
     */
    function getUpdateCount(model) {
      return changeCount[model];
    }

    /**
     * Increment update count for specified type.
     * @param {String} model - The model name
     */
    function incrementUpdateCount(model) {
      if (!changeCount[model]) {
        changeCount[model] = 0;
      }

      changeCount[model]++;
    }

    return {
      getUpdateCount: getUpdateCount,
      incrementUpdateCount: incrementUpdateCount
    };
  })();
})(window.GGRC);
