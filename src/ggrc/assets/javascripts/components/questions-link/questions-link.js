/*!
    Copyright (C) 2017 Google Inc.
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

(function (can, GGRCQ) {
  'use strict';

  GGRC.Components('questionsLink', {
    tag: 'questions-link',
    template: can.view(
      GGRC.mustache_path +
      '/components/questions-link/questions-link.mustache'
    ),
    viewModel: {
      instance: null
    },
    events: {
      init: function () {
        var instance = this.scope.attr('instance');
        var model;
        if (!instance || !instance.class) {
          return;
        }
        model = instance.class.title_singular;
        this.scope.attr('hasQuestions', GGRCQ.hasQuestions(model));
        this.scope.attr('questionsUrl', GGRCQ.getQuestionsUrl(instance));
      }
    }
  });
})(window.can, window.GGRC.Utils.GGRCQ);
