/*!
 Copyright (C) 2017 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */
(function (can, GGRC, CMS) {
  'use strict';

  can.Model.Cacheable('CMS.Models.Assessment', {
    root_object: 'assessment',
    root_collection: 'assessments',
    findOne: 'GET /api/assessments/{id}',
    findAll: 'GET /api/assessments',
    update: 'PUT /api/assessments/{id}',
    destroy: 'DELETE /api/assessments/{id}',
    create: 'POST /api/assessments',
    mixins: [
      'ownable', 'contactable', 'unique_title',
      'autoStatusChangeable', 'timeboxed', 'mapping-limit',
      'inScopeObjects', 'updateCounter'
    ],
    is_custom_attributable: true,
    defaults: {
      status: 'Not Started',
      send_by_default: true,  // notifications when a comment is added
      recipients: 'Assessor,Creator,Verifier'  // user roles to be notified
    },
    statuses: ['Not Started', 'In Progress', 'Ready for Review',
      'Verified', 'Completed'],
    tree_view_options: {
      add_item_view: GGRC.mustache_path +
      '/base_objects/tree_add_item.mustache',
      attr_view: GGRC.mustache_path + '/base_objects/tree-item-attr.mustache',
      attr_list: [{
        attr_title: 'Title',
        attr_name: 'title',
        order: 1
      }, {
        attr_title: 'Code',
        attr_name: 'slug',
        order: 4
      }, {
        attr_title: 'State',
        attr_name: 'status',
        order: 2
      }, {
        attr_title: 'Verified',
        attr_name: 'verified',
        order: 3
      }, {
        attr_title: 'Last Updated',
        attr_name: 'updated_at',
        order: 9
      }, {
        attr_title: 'Conclusion: Design',
        attr_name: 'design',
        order: 14
      }, {
        attr_title: 'Conclusion: Operation',
        attr_name: 'operationally',
        order: 15
      }, {
        attr_title: 'Finished Date',
        attr_name: 'finished_date',
        order: 11
      }, {
        attr_title: 'Verified Date',
        attr_name: 'verified_date',
        order: 10
      }, {
        attr_title: 'Assessment URL',
        attr_name: 'url',
        attr_sort_field: 'assessment url',
        order: 12
      }, {
        attr_title: 'Reference URL',
        attr_name: 'reference_url',
        order: 13
      }, {
        attr_title: 'Creators',
        attr_name: 'creators',
        order: 5
      }, {
        attr_title: 'Assignees',
        attr_name: 'assignees',
        order: 6
      }, {
        attr_title: 'Verifiers',
        attr_name: 'verifiers',
        order: 7
      }, {
        attr_title: 'Created Date',
        attr_name: 'created_at',
        order: 8
      }]
    },
    info_pane_options: {
      evidence: {
        model: CMS.Models.Document,
        mapping: 'all_documents',
        show_view: GGRC.mustache_path + '/base_templates/attachment.mustache',
        sort_function: GGRC.Utils.sortingHelpers.commentSort
      },
      urls: {
        model: CMS.Models.Document,
        mapping: 'all_urls',
        show_view: GGRC.mustache_path + '/base_templates/urls.mustache'
      }
    },
    confirmEditModal: {
      title: 'Confirm moving Assessment to "In Progress"',
      description: 'You are about to move Assessment from ' +
      '"{{status}}" to "In Progress" - are you sure about that?',
      button: 'Confirm'
    },
    assignable_list: [{
      title: 'Creator(s)',
      type: 'creator',
      mapping: 'related_creators',
      required: true
    }, {
      title: 'Assignee(s)',
      type: 'assessor',
      mapping: 'related_assessors',
      required: true
    }, {
      title: 'Verifier(s)',
      type: 'verifier',
      mapping: 'related_verifiers',
      required: false
    }],
    conflicts: [
      ['assessor', 'verifier']
    ],
    conclusions: ['Effective', 'Ineffective', 'Needs improvement',
      'Not Applicable'],
    init: function () {
      if (this._super) {
        this._super.apply(this, arguments);
      }
      this.validatePresenceOf('audit');
      this.validateNonBlank('title');

      this.validate(
        'validate_creator',
        function () {
          if (!this.validate_creator) {
            return 'You need to specify at least one creator';
          }
        }
      );
      this.validate(
        'validate_assessor',
        function () {
          if (!this.validate_assessor) {
            return 'You need to specify at least one assignee';
          }
        }
      );
    },
    prepareAttributes: function (attrs) {
      return attrs[this.root_object] ? attrs[this.root_object] : attrs;
    },
    /**
     * Assessment specific AJAX data parsing logic
     * @param {Object} attributes - hash of Model key->values
     * @return {Object} - parsed object with normalized data
     */
    parseModel: function (attributes) {
      var values;
      var definitions;
      attributes = this.prepareAttributes(attributes);
      values = attributes.custom_attribute_values || [];
      definitions = attributes.custom_attribute_definitions || [];

      if (!definitions.length) {
        return attributes;
      }

      attributes.custom_attribute_values =
        GGRC.Utils.CustomAttributes
          .prepareCustomAttributes(definitions, values);
      return attributes;
    },
    model: function (attributes, oldModel) {
      var model;
      var id;
      if (!attributes) {
        return;
      }

      if (typeof attributes.serialize === 'function') {
        attributes = attributes.serialize();
      } else {
        attributes = this.parseModel(attributes);
      }

      id = attributes[this.id];
      if ((id || id === 0) && this.store[id]) {
        oldModel = this.store[id];
      }

      model = oldModel && can.isFunction(oldModel.attr) ?
        oldModel.attr(attributes) :
          new this(attributes);

      if (attributes.assignees) {
        this.leaveUniqueAssignees(model, attributes, 'Verifier');
        this.leaveUniqueAssignees(model, attributes, 'Assessor');
        this.leaveUniqueAssignees(model, attributes, 'Creator');
      }

      return model;
    },
    leaveUniqueAssignees: function (model, attributes, type) {
      var assignees = attributes.assignees[type];
      var unique = [];
      if (assignees) {
        unique = _.uniq(assignees, function (item) {
          return item.id;
        });
      }

      if (!model.attr('assignees')) {
        model.attr('assignees', new can.Map());
      }

      model.assignees.attr(type, unique);
    },
    /**
     * Replace Cacheble#findInCacheById method with the latest feature of can.Model - store
     * @param {String} id - Id of requested Model
     * @return {CMS.Models.Assessment} - already existing model
     */
    findInCacheById: function (id) {
      return this.store[id];
    }
  }, {
    init: function () {
      if (this._super) {
        this._super.apply(this, arguments);
      }
      this.bind('refreshInstance', this.refresh.bind(this));
    },
    before_create: function () {
      if (!this.audit) {
        throw new Error('Cannot save assessment, audit not set.');
      } else if (!this.audit.context) {
        throw new Error(
          'Cannot save assessment, audit context not set.');
      }
      this.attr('context', this.attr('audit.context'));
      this.attr('design', '');
      this.attr('operationally', '');
    },
    _transformBackupProperty: function (badProperties) {
      var backupInstance = this._backupStore();
      if (!backupInstance) {
        return;
      }
      badProperties.forEach(function (property) {
        if (!this[property] && !backupInstance[property] &&
        (this[property] !== backupInstance[property])) {
          backupInstance[property] = this[property];
        }
      }.bind(this));

      if (this.validate_assessor !== undefined) {
        backupInstance.validate_assessor = this.validate_assessor;
      }
      if (this.validate_creator !== undefined) {
        backupInstance.validate_creator = this.validate_creator;
      }
    },
    isDirty: function (checkAssociations) {
      this._transformBackupProperty(['design', 'operationally', '_disabled']);
      return this._super(checkAssociations);
    },
    after_save: function () {
      this.dispatch('refreshInstance');
      if (this.audit && this.audit.selfLink) {
        this.audit.refresh();
      }
    },
    form_preload: function (newObjectForm) {
      var pageInstance = GGRC.page_instance();
      var currentUser = CMS.Models.get_instance('Person',
        GGRC.current_user.id, GGRC.current_user);
      var auditLead;
      var self = this;

      if (pageInstance && (!this.audit || !this.audit.id || !this.audit.type)) {
        if (pageInstance.type === 'Audit') {
          this.attr('audit', pageInstance);
        } else if (this.scopeObject) {
          this.audit = this.scopeObject;
        }
      }

      if (!newObjectForm) {
        return;
      }

      // Make sure before create is called before save
      this.before_create();

      if (this.audit) {
        auditLead = this.audit.contact.reify();
        if (currentUser === auditLead) {
          markForAddition(this, auditLead, 'Creator,Assessor');
        } else {
          markForAddition(this, auditLead, 'Assessor');
          markForAddition(this, currentUser, 'Creator');
        }

        this.audit.findAuditors().then(function (list) {
          list.forEach(function (item) {
            markForAddition(self, item.person, 'Verifier');
          });
        });
      } else {
        markForAddition(this, currentUser, 'Creator');
      }

      function markForAddition(instance, user, type) {
        instance.mark_for_addition('related_objects_as_destination', user, {
          attrs: {
            AssigneeType: type
          }
        });
      }
    },
    refresh: function () {
      var dfd;
      var href = this.selfLink || this.href;
      var that = this;

      if (!href) {
        return can.Deferred().reject();
      }
      if (!this._pending_refresh) {
        this._pending_refresh = {
          dfd: can.Deferred(),
          fn: _.throttle(function () {
            var dfd = that._pending_refresh.dfd;
            can.ajax({
              url: href,
              type: 'get',
              dataType: 'json'
            })
          .then(function (model) {
            delete that._pending_refresh;
            if (model) {
              model = CMS.Models.Assessment.model(model, that);
              model.backup();
              return model;
            }
          })
          .done(function () {
            dfd.resolve.apply(dfd, arguments);
          })
          .fail(function () {
            dfd.reject.apply(dfd, arguments);
          });
          }, 300, {trailing: false})
        };
      }
      dfd = this._pending_refresh.dfd;
      this._pending_refresh.fn();
      return dfd;
    },
    info_pane_preload: function () {
      this.refresh();
    },
    get_related_objects_as_source: function () {
      var dfd = can.Deferred();
      var self = this;
      var snapshots = GGRC.Utils.Snapshots;
      this.get_binding('related_objects_as_source')
        .refresh_instances()
        .then(function (list) {
          var newList = list.filter(function (item) {
            return !snapshots.isSnapshotModel(item.instance.type) &&
                item.instance.type !== 'Comment';
          });
          newList.forEach(function (item) {
            var query;
            var instance = item.instance;
            if (snapshots.isSnapshotType(instance)) {
              query = snapshots.getSnapshotItemQuery(
                self, instance.child_id, instance.child_type);

              GGRC.Utils.QueryAPI
                .makeRequest(query)
                .done(function (responseArr) {
                  var data = responseArr[0];
                  var value = data.Snapshot.values[0];
                  var object;

                  if (!value) {
                    return;
                  }

                  object = GGRC.Utils.Snapshots.toObject(value);
                  instance.attr('class', object.class);
                  instance.attr('snapshot_object_class',
                    'snapshot-object');
                  instance.attr('title', object.title);
                  instance.attr('viewLink', object.originalLink);
                });
            }
          });
          dfd.resolve(newList);
        });
      return dfd;
    }
  });
})(window.can, window.GGRC, window.CMS);
