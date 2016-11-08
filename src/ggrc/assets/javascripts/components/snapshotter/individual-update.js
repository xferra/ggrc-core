/*!
 Copyright (C) 2016 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */
(function (can, $) {
  'use strict';

  GGRC.Components('SnapshotIndividualUpdater', {
    tag: 'snapshot-individual-update',
    template: '<content/>',
    scope: {
      instance: null,
      updateIt: function (scope, el, ev) {
        GGRC.Controllers.Modals.confirm({
          instance: scope,
          modal_title: 'Update to latest version',
          modal_description:
            'Do you want to update this ' +
            this.instance.class.title_singular +
            ' version of the Audit to the latest version?',
          modal_confirm: 'Update',
          button_view: GGRC.Controllers.Modals.BUTTON_VIEW_OK_CLOSE,
          skip_refresh: false
        }, function () {
          var instance = this.instance.snapshot;
          instance.refresh().then(function () {
            var data = {
              operation: 'update'
            };
            instance.attr('individual-update', data);
            instance.save();
          });
        }.bind(this));
      }
    }
  });
})(window.can, window.can.$);
