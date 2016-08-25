/*!
  Copyright (C) 2016 Google Inc.
  Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

(function ($, GGRC, moment, Permission) {
  /**
   * A module containing various utility functions.
   */
  GGRC.Utils = {
    win: window,
    inViewport: function (el) {
      var bounds;
      var isVisible;

      el = el instanceof jQuery ? el[0] : el;
      bounds = el.getBoundingClientRect();

      isVisible = this.win.innerHeight > bounds.bottom &&
        this.win.innerWidth > bounds.right;

      return isVisible;
    },
    firstWorkingDay: function (date) {
      date = moment(date);
      // 6 is Saturday 0 is Sunday
      while (_.contains([0, 6], date.day())) {
        date.add(1, 'day');
      }
      return date.toDate();
    },
    formatDate: function (date, hideTime) {
      var currentTimezone = moment.tz.guess();
      var inst;

      if (date === undefined || date === null) {
        return '';
      }

      inst = moment(new Date(date.isComputed ? date() : date));
      if (hideTime === true) {
        return inst.format('MM/DD/YYYY');
      }
      return inst.tz(currentTimezone).format('MM/DD/YYYY hh:mm:ss A z');
    },
    getPickerElement: function (picker) {
      return _.find(_.values(picker), function (val) {
        if (val instanceof Node) {
          return /picker\-dialog/.test(val.className);
        }
        return false;
      });
    },
    download: function (filename, text) {
      var element = document.createElement('a');
      element.setAttribute(
        'href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
      element.setAttribute('download', filename);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    },
    export_request: function (request) {
      return $.ajax({
        type: 'POST',
        dataType: 'text',
        headers: $.extend({
          'Content-Type': 'application/json',
          'X-export-view': 'blocks',
          'X-requested-by': 'gGRC'
        }, request.headers || {}),
        url: '/_service/export_csv',
        data: JSON.stringify(request.data || {})
      });
    },
    hasPending: function (parentInstance, instance, how) {
      var list = parentInstance._pending_joins;
      how = how || 'add';

      if (!list || !list.length) {
        return false;
      }
      if (list instanceof can.List) {
        list = list.serialize();
      }

      return _.find(list, function (pending) {
        var method = pending.how === how;
        if (!instance) {
          return method;
        }
        return method && pending.what === instance;
      });
    },
    is_mapped: function (target, destination, mapping) {
      var tablePlural;
      var bindings;

      if (_.isUndefined(mapping)) {
        tablePlural = CMS.Models[destination.type].table_plural;
        mapping = (target.has_binding(tablePlural) ? '' : 'related_') +
          tablePlural;
      }
      bindings = target.get_binding(mapping);
      if (bindings && bindings.list && bindings.list.length) {
        return _.find(bindings.list, function (item) {
          return item.instance.id === destination.id;
        });
      }
      if (target.objects && target.objects.length) {
        return _.find(target.objects, function (item) {
          return item.id === destination.id && item.type === destination.type;
        });
      }
    },
    /**
     * Get list of mappable objects for certain type
     *
     * @param {String} type - Type of object we want to
     *                      get list of mappable objects for
     * @param {Object} options - Options
     *   @param {Array} options.whitelist - List of objects that will always appear
     *   @param {Array} options.forbidden - List of objects that will always be removed
     *
     * @return {Array} - List of mappable objects
     */
    getMappableTypes: function (type, options) {
      var result;
      var canonical = GGRC.Mappings.get_canonical_mappings_for(type);
      var list = GGRC.tree_view.base_widgets_by_type[type];
      var forbidden;
      var forbiddenList = {
        Program: ['Audit', 'RiskAssessment'],
        Audit: ['Assessment', 'Program', 'Request'],
        Assessment: ['Workflow', 'TaskGroup'],
        Request: ['Workflow', 'TaskGroup', 'Person', 'Audit'],
        Person: '*',
        AssessmentTemplate: '*'
      };
      options = options || {};
      if (!type) {
        return [];
      }
      if (options.forbidden) {
        forbidden = options.forbidden;
      } else {
        forbidden = forbiddenList[type] || [];
      }
      result = _.intersection.apply(_, _.compact([_.keys(canonical), list]));
      if (_.isString(forbidden) && forbidden === '*') {
        forbidden = [];
        result = [];
      }
      result = _.partial(_.without, result);
      result = result.apply(result, forbidden);

      if (options.whitelist) {
        result = _.union(result, options.whitelist);
      }
      return result;
    },

    /**
     * Determine if two types of models can be mapped
     *
     * @param {String} target - the target type of model
     * @param {String} source - the source type of model
     * @param {Object} options - accepts:
     *        {Array} whitelist - list of added objects
     *        {Array} forbidden - list blacklisted objects
     *
     * @return {Boolean} - true if mapping is allowed, false otherwise
     */
    isMappableType: function (target, source, options) {
      var result;
      if (!target || !source) {
        return false;
      }
      result = this.getMappableTypes(target, options);
      return _.contains(result, source);
    },
    /**
     * Determine if `source` is allowed to be mapped to `target`.
     *
     * By symmetry, this method can be also used to check whether `source` can
     * be unmapped from `target`.
     *
     * @param {Object} source - the source object the mapping
     * @param {Object} target - the target object of the mapping
     * @param {Object} options - the options objects, similar to the one that is
     *   passed as an argument to Mustache helpers
     *
     * @return {Boolean} - true if mapping is allowed, false otherwise
     */
    allowed_to_map: function (source, target, options) {
      var canMap = false;
      var types;
      var targetType;
      var sourceType;
      var targetContext;
      var sourceContext;
      var createContexts;
      var canonical;
      var hasWidget;
      var canonicalMapping;

      // NOTE: the names in every type pair must be sorted alphabetically!
      var FORBIDDEN = Object.freeze({
        'audit program': true,
        'audit request': true,
        'program riskassessment': true,
        'assessmenttemplate cacheable': true,
        'cacheable person': true
      });

      if (target instanceof can.Model) {
        targetType = target.constructor.shortName;
      } else {
        targetType = target.type || target;
      }
      sourceType = source.constructor.shortName || source;

      // special case check:
      // - mapping an Audit to a Program is not allowed
      // - mapping an Audit to a Request is not allowed
      // (and vice versa)
      types = [sourceType.toLowerCase(), targetType.toLowerCase()].sort();
      if (FORBIDDEN[types.join(' ')]) {
        return false;
      }

      canonical = GGRC.Mappings.get_canonical_mapping_name(
        sourceType, targetType);
      canonicalMapping = GGRC.Mappings.get_canonical_mapping(
        sourceType, targetType);

      if (canonical && canonical.indexOf('_') === 0) {
        canonical = null;
      }

      hasWidget = _.contains(
        GGRC.tree_view.base_widgets_by_type[sourceType] || [],
        targetType);

      if (_.exists(options, 'hash.join') && (!canonical || !hasWidget) ||
        (canonical && !canonicalMapping.model_name)) {
        return false;
      }
      targetContext = _.exists(target, 'context.id');
      sourceContext = _.exists(source, 'context.id');
      createContexts = _.exists(
        GGRC, 'permissions.create.Relationship.contexts');

      canMap = Permission.is_allowed_for('update', source) ||
        sourceType === 'Person' ||
        _.contains(createContexts, sourceContext) ||
        // Also allow mapping to source if the source is about to be created.
        _.isUndefined(source.created_at);

      if (target instanceof can.Model) {
        canMap = canMap &&
          (Permission.is_allowed_for('update', target) ||
           targetType === 'Person' ||
           _.contains(createContexts, targetContext));
      }
      return canMap;
    },
    isEmptyCA: function (value, type) {
      var result = false;
      var types = ['Text', 'Rich Text', 'Date', 'Checkbox', 'Dropdown',
        'Map:Person'];
      var options = {
        Checkbox: function (value) {
          return value === '0';
        },
        'Rich Text': function (value) {
          return _.isEmpty($('<span>' + value).text());
        }
      };
      if (types.indexOf(type) >= 0 && options[type]) {
        result = options[type](value);
      } else if (types.indexOf(type) >= 0) {
        result = _.isEmpty(value);
      }
      return result;
    },
    /**
     * Add subtree for object tree view
     * @param {Number} depth - for subtree
     * @return {Object} - mapping of related objects
     */
    getRelatedObjects: function (depth) {
      var basedRelatedObjects;
      var relatedObject;
      var mustachePath = GGRC.mustache_path;
      if (!depth) {
        return {};
      }

      basedRelatedObjects = {
        model: can.Model.Cacheable,
        mapping: 'related_objects',
        show_view: mustachePath + '/base_objects/tree.mustache',
        footer_view: mustachePath + '/base_objects/tree_footer.mustache',
        add_item_view: mustachePath + '/base_objects/tree_add_item.mustache',
        draw_children: false
      };

      relatedObject = $.extend(basedRelatedObjects, {
        child_options: [this.getRelatedObjects(depth - 1)]
      });

      if (depth === 1) {
        return relatedObject;
      }

      relatedObject.draw_children = true;

      return relatedObject;
    },
    /**
     * A function that returns the highest role in an array of strings of roles
     * or a comma-separated string of roles.
     *
     * @param {CMS.Models.Cacheable} obj - Assignable object with defined
     *   assignable_list class property holding assignable roles ordered in
     *   increasing importance.
     * Return highest assignee role from a list of roles
     * @param {Array|String} roles - An Array of strings or a String with comma
     *   separated values of roles.
     * @return {string} - Highest role from an array of strings or 'none' if
     *   none found.
     */
    get_highest_assignee_role: function (obj, roles) {
      var roleOrder = _.map(
        _.map(obj.class.assignable_list, 'type'),
        _.capitalize);

      if (_.isString(roles)) {
        roles = roles.split(',');
      }

      roles = _.map(roles, _.capitalize);

      roles.unshift('none');
      return _.max(roles, Array.prototype.indexOf.bind(roleOrder));
    }
  };
})(jQuery, window.GGRC = window.GGRC || {}, window.moment, window.Permission);
