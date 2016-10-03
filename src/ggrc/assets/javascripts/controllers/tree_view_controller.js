/*!
    Copyright (C) 2016 Google Inc.
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
*/

// require can.jquery-all

function _firstElementChild(el) {
  var i;
  if (el.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    for (i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType !== Node.TEXT_NODE) {
        return el.childNodes[i];
      }
    }
  } else {
    return el;
  }
}

if (!GGRC.tree_view) {
  GGRC.tree_view = new can.Map();
}
GGRC.tree_view.attr('basic_model_list', []);
GGRC.tree_view.attr('sub_tree_for', {});

function _display_tree_subpath(el, path, attempt_counter) {
  var rest = path.split('/');
  var type = rest.shift();
  var id = rest.shift();
  var selector = '[data-object-type=\'' + type + '\'][data-object-id=' + id + ']';
  var $node;
  var node_controller;
  var controller;

  if (!attempt_counter) {
    attempt_counter = 0;
  }

  rest = rest.join('/');

  if (type || id) {
    $node = el.find(selector);

    // sometimes nodes haven't loaded yet, wait for them
    if (!$node.size() && attempt_counter < 5) {
      setTimeout(function () {
        _display_tree_subpath(el, path, attempt_counter + 1);
      }, 100);
      return undefined;
    }

    if (!rest.length) {
      controller = $node
              .closest('.cms_controllers_tree_view_node')
              .control();

      if (controller) {
        controller.select();
      }
    } else {
      node_controller = $node.control();
      if (node_controller && node_controller.display_path) {
        return node_controller.display_path(rest);
      }
    }
  }
  return new $.Deferred().resolve();
}

can.Observe('can.Observe.TreeOptions', {
  defaults: {
    instance: undefined,
    parent: null,
    children_drawn: false
  }
}, {});

can.Control('CMS.Controllers.TreeLoader', {
  defaults: {}
}, {
  init_spinner: function () {
    var spinner;
    var $spinner;
    var $footer;
    var $wrapper;
    var spinnerTopOffset = '40%';
    var elementOffset = $(window).height() - this.element.offset().top;

    if (this.element) {
      $footer = this.element.children('.tree-item-add').first();
      spinner = new Spinner({
        radius: 4,
        length: 4,
        width: 2
      }).spin();
      $spinner = $(spinner.el);
      if (this.options.is_subtree) {
        $wrapper = $('<li class="tree-item tree-spinner"/>');
      } else {
        $wrapper = $('<div class="tree-spinner"/>');
      }
      if (!this.options.is_subtree && !this.element.next().length) {
        $wrapper.css('height', '40px');
      }

      if (this.element.height() > elementOffset) {
        spinnerTopOffset = Math.floor(elementOffset / 2) + 'px';
      }

      $wrapper.append($spinner);
      $spinner.css({
        display: 'absolute',
        left: '50%',
        top: spinnerTopOffset
      });

      // Admin dashboard
      if ($footer.length === 0 &&
        this.element.children('.tree-structure').length > 0) {
        this.element.children('.tree-structure')
          .addClass('new-tree_loading').append($wrapper);
      } else if ($footer.length === 0) { // My work
        this.element.addClass('new-tree_loading').append($wrapper);
      } else {
        $footer.before($wrapper);
      }
    }
  },
  prepare: function () {
    if (this._prepare_deferred) {
      return this._prepare_deferred;
    }

    this._prepare_deferred = $.Deferred();
    this._prepare_deferred.resolve();

    this._attached_deferred.then(function () {
      if (!this.element) {
        return;
      }
      can.trigger(this.element, 'updateCount', [0, this.options.update_count]);
      this.init_count();
    }.bind(this));

    return this._prepare_deferred;
  },

  show_info_pin: function () {
    var children;
    var controller;
    if (this.element && !this.element.data('no-pin')) {
      children = this.element.children();
      controller = children && children.find('.select:visible')
              .first()
              .closest('.cms_controllers_tree_view_node')
              .control();

      if (controller) {
        controller.select();
      }
    }
  },

  display: function () {
    var that = this;
    var tracker_stop = GGRC.Tracker.start(
          'TreeView', 'display', this.options.model.shortName);
    // TODO: Currently Query API doesn't support CustomAttributable.
    var isCustomAttr = /CustomAttr/.test(this.options.model.shortName);
    var isTreeView = this instanceof CMS.Controllers.TreeView;
    // Use Query API only for first tier in TreeViewController
    var loader = !isTreeView || isCustomAttr ||
      this.options.attr('is_subtree') ?
        this.fetch_list.bind(this) : this.loadPage.bind(this);

    if (this._display_deferred) {
      return this._display_deferred;
    }

    this._display_deferred = $.when(this._attached_deferred, this.prepare());

    this._display_deferred = this._display_deferred
      .then(this._ifNotRemoved(function () {
        return $.when(loader(), that.init_view());
      }))
      .then(that._ifNotRemoved(that.proxy('draw_list')))
      .done(tracker_stop);

    this._display_deferred.then(function (e) {
    }.bind(this));

    return this._display_deferred;
  },

  draw_list: function (list, is_reload, force_prepare_children) {
    is_reload = is_reload === true;
    // TODO figure out why this happens and fix the root of the problem
    if (!list && !this.options.list) {
      return undefined;
    }
    if (this._draw_list_deferred) {
      return this._draw_list_deferred;
    }
    this._draw_list_deferred = new $.Deferred();
    if (this.element && !this.element.closest('body').length) {
      return undefined;
    }

    if (list) {
      list = list.length === null ? new can.Observe.List([list]) : list;
    } else {
      list = this.options.list;
    }

    if (!this.element) {
      return undefined;  // controller has been destroyed
    }

    this.options.attr('original_list', list);
    this.options.attr('list', []);
    this.on();

    this._draw_list_deferred = this.enqueue_items(list, is_reload, force_prepare_children);
    return this._draw_list_deferred;
  },

  _loading_started: function () {
    if (!this._loading_deferred) {
      this._loading_deferred = new $.Deferred();
      this.init_spinner();
      this.element.trigger('loading');
    }
  },

  _loading_finished: function () {
    var loading_deferred;
    if (this._loading_deferred) {
      this.element.trigger('loaded');
      this.element.find('.tree-spinner').remove();
      if (this.element.hasClass('new-tree_loading')) {
        this.element.removeClass('new-tree_loading');
      } else {
        this.element.find('.new-tree_loading').removeClass('new-tree_loading');
      }
      loading_deferred = this._loading_deferred;
      this._loading_deferred = null;
      loading_deferred.resolve();
    }
  },

  enqueue_items: function (items, is_reload, force_prepare_children) {
    var child_tree_display_list = [];
    var filtered_items = [];
    var i;
    var refreshed_deferred;
    var that = this;
    var parent_model_name;
    var parent_instance_type;
    is_reload = is_reload === true;

    // find current widget model and check if first layer tree
    if (GGRC.page_object && this.options.parent) { // this is a second label tree
      parent_model_name = this.options.parent.options.model.shortName;
      parent_instance_type = this.options.parent.options.instance.type;
      child_tree_display_list =
        (GGRC.tree_view.sub_tree_for[parent_model_name] ||
         GGRC.tree_view.sub_tree_for[parent_instance_type] ||
         {} // all hope is lost, skip filtering
        ).display_list;

      // check if no objects selected, then skip filter
      if (!child_tree_display_list) {
        // skip filter
        filtered_items = items;
      } else if (child_tree_display_list.length === 0) { // no item is selected to filter, so just return
        return new $.Deferred().resolve();
      } else {
        for (i = 0; i < items.length; i++) {
          if (child_tree_display_list.indexOf(items[i].instance.class.model_singular) !== -1) {
            filtered_items.push(items[i]);
          }
        }
      }
    } else {
      filtered_items = items;
    }

    if (!this._pending_items) {
      this._pending_items = [];
      this._loading_started();
    }

    if (!is_reload) {
      refreshed_deferred = $.when.apply($,
        can.map(filtered_items, function (item) {
          var instance = item.instance || item;
          if (instance.custom_attribute_values) {
            return instance.refresh_all('custom_attribute_values').then(function (values) {
              var rq = new RefreshQueue();
              _.each(values, function (value) {
                if (value.attribute_object) {
                  rq.enqueue(value.attribute_object);
                }
              });
              return rq.trigger().then(function () {
                return values;
              });
            });
          }
        }));
    } else {
      refreshed_deferred = new $.Deferred().resolve();
    }
    refreshed_deferred
      .then(function () {
        return that.insert_items(filtered_items, force_prepare_children);
      })
      .then(this._ifNotRemoved(this.proxy('_loading_finished')));

    return this._loading_deferred;
  },

  insert_items: function (items, force_prepare_children) {
    var that = this;
    var preppedItems = [];
    var idMap = {};
    var toInsert;
    var dfd;

    if (this.options.attr('is_subtree')) {
      // Check the list of items to be inserted for any duplicate items.
      can.each(this.options.list || [], function (item) {
        idMap[item.instance.type + item.instance.id] = true;
      });
      toInsert = _.filter(items, function (item) {
        return !idMap[item.instance.type + item.instance.id];
      });
    } else {
      toInsert = items;
    }

    can.each(toInsert, function (item) {
      var prepped = that.prepare_child_options(item, force_prepare_children);
      if (prepped.instance.selfLink) {
        preppedItems.push(prepped);
      }
    });

    if (preppedItems.length > 0) {
      this.options.list.push.apply(this.options.list, preppedItems);
      dfd = this.add_child_lists(preppedItems);
    } else {
      dfd = $.Deferred().resolve();
    }

    return dfd;
  }
});

CMS.Controllers.TreeLoader('CMS.Controllers.TreeView', {
  // static properties
  defaults: {
    model: null,
    header_view: GGRC.mustache_path + '/base_objects/tree_header.mustache',
    show_view: null,
    show_header: false,
    footer_view: null,
    add_item_view: null,
    parent: null,
    list: null,
    filteredList: [],
    single_object: false,
    find_params: {},
    paging: {
      current: 1,
      total: null,
      pageSize: 10,
      count: null,
      pageSizeSelect: [10, 25, 50],
      filter: null,
      sortDirection: null,
      sortBy: null,
      disabled: false
    },
    fields: [],
    sortable: true,
    start_expanded: false, // true
    draw_children: true,
    find_function: null,
    options_property: 'tree_view_options',
    allow_reading: true,
    allow_mapping: true,
    allow_creating: true,
    child_options: [], // this is how we can make nested configs. if you want to use an existing
    // example child option:
    // { property: "controls", model: CMS.Models.Control, }
    // { parent_find_param: "system_id" ... }
    scroll_page_count: 1, // pages above and below viewport
    is_subtree: false
  },
  do_not_propagate: [
    'header_view', 'footer_view', 'add_item_view', 'list', 'original_list', 'single_object', 'find_function',
    'find_all_deferred'
  ]
}, {
  // prototype properties
  setup: function (el, opts) {
    var that = this;
    if (typeof this._super === 'function') {
      this._super(el);
    }
    if (opts instanceof can.Observe) {
      this.options = opts;
      if (typeof (this.options.model) === 'string') {
        this.options.attr('model', CMS.Models[this.options.model]);
      }
      if (this.options.model) {
        can.each(this.options.model[opts.options_property || this.constructor.defaults.options_property], function (v, k) {
          if (!that.options.hasOwnProperty(k)) {
            that.options.attr(k, v);
          }
        });
      }
      can.each(this.constructor.defaults, function (v, k) {
        if (!that.options.hasOwnProperty(k)) {
          that.options.attr(k, v);
        }
      });
    } else {
      if (typeof (opts.model) === 'string') {
        opts.model = CMS.Models[opts.model];
      }
      this.options = new can.Observe(this.constructor.defaults).attr(opts.model ? opts.model[opts.options_property || this.constructor.defaults.options_property] : {}).attr(opts);
    }
  },
  deselect: function () {
    var active = this.element.find('.cms_controllers_tree_view_node.active');
    active.removeClass('active');
    this.update_hash_fragment(active.length);
  },
  update_hash_fragment: function (status) {
    var hash;
    if (!status) {
      return;
    }
    hash = window.location.hash.split('/');
    hash.pop();
    window.location.hash = hash.join('/');
  },
  // Total display with is set to be span12.
  // Default: title: span4
  //          middle selectable: span4, by default 2 attributes are selected
  //          action: span4
  // When user selects 3 middle selectable attribute, title width is reduced to span3
  // and when user selects 4 attributes, the action column is also reduced to span3
  setup_column_width: function () {
    var display_options;
    var display_width = 12;
    var attr_count = this.options.display_attr_list.length;
    var nested = this.options.parent !== null;
    var widths = {
      defaults: [4, 4, 4],
      '0': [7, 1, 4],
      '3': [3, 5, 4],
      '4': [3, 6, 3],
      nested: [4, 0, 8]
    };
    var selected_widths = widths[attr_count] || widths.defaults;

    if (nested) {
      selected_widths = widths.nested;
    }

    display_options = {
      title_width: selected_widths[0],
      selectable_width: selected_widths[1],
      action_width: selected_widths[2],
      selectable_attr_width: display_width / Math.max(attr_count, 1)
    };
    this.options.attr('display_options', display_options);
  },

  init_child_tree_display: function (model) {
    var model_name;
    var child_tree_model_list;
    var valid_models;
    var w_list;
    var sub_tree;
    if (!GGRC.page_object) { // Admin dashboard
      return;
    }

    // Set child tree options
    model_name = model.model_singular;
    child_tree_model_list = [];
    valid_models = can.Map.keys(GGRC.tree_view.base_widgets_by_type);

    w_list = GGRC.tree_view.base_widgets_by_type[model_name]; // possible widget/mapped model_list
    if (w_list === undefined) {
      child_tree_model_list = GGRC.tree_view.basic_model_list;
      GGRC.tree_view.sub_tree_for.attr(model_name, {
        model_list: child_tree_model_list,
        display_list: valid_models
      });
    }

    sub_tree = GGRC.tree_view.sub_tree_for[model_name];
    this.options.attr('child_tree_model_list', sub_tree.model_list);
    this.options.attr('selected_child_tree_model_list', sub_tree.model_list);
    this.options.attr('select_model_list', GGRC.tree_view.basic_model_list);
    this.options.attr('selected_model_name', model_name);
  },

  // Displays attribute list for tree-header, Select attribute list drop down
  // Gets default and custom attribute list for each model, and sets upthe display-list
  init_display_options: function (opts) {
    var i;
    var saved_attr_list;
    var select_attr_list = [];
    var display_attr_list = [];
    var model = opts.model;
    var model_name = model.model_singular;
    var model_definition = model().class.root_object;
    var mandatory_attr_names;
    var display_attr_names;
    var attr;

    // get standard attrs for each model
    can.each(model.tree_view_options.attr_list || can.Model.Cacheable.attr_list, function (item) {
      if (!item.attr_sort_field) {
        item.attr_sort_field = item.attr_name;
      }
      select_attr_list.push(item);
    });
    // Get mandatory_attr_names
    mandatory_attr_names = model.tree_view_options.mandatory_attr_names ?
      model.tree_view_options.mandatory_attr_names :
        can.Model.Cacheable.tree_view_options.mandatory_attr_names;

    // get custom attrs
    can.each(GGRC.custom_attr_defs, function (def, i) {
      var obj;
      if (def.definition_type === model_definition && def.attribute_type !== 'Rich Text') {
        obj = {};
        obj.attr_title = obj.attr_name = def.title;
        obj.display_status = false;
        obj.attr_type = 'custom';
        obj.attr_sort_field = obj.attr_name;
        select_attr_list.push(obj);
      }
    });

    // Get the display attr_list from local storage
    saved_attr_list = this.display_prefs.getTreeViewHeaders(model_name);

    if (!saved_attr_list.length) {
      // Initialize the display status, Get display_attr_names for model
      display_attr_names = model.tree_view_options.display_attr_names ?
        model.tree_view_options.display_attr_names :
          can.Model.Cacheable.tree_view_options.display_attr_names;

      for (i = 0; i < select_attr_list.length; i++) {
        attr = select_attr_list[i];

        attr.display_status = display_attr_names.indexOf(attr.attr_name) !== -1;
        attr.mandatory = mandatory_attr_names.indexOf(attr.attr_name) !== -1;
      }
    } else {
      // Mandatory attr should be always displayed in tree view
      can.each(mandatory_attr_names, function (attr_name) {
        saved_attr_list.push(attr_name);
      });

      for (i = 0; i < select_attr_list.length; i++) {
        attr = select_attr_list[i];
        attr.display_status = saved_attr_list.indexOf(attr.attr_name) !== -1;
        attr.mandatory = mandatory_attr_names.indexOf(attr.attr_name) !== -1;
      }
    }

    // Create display list
    can.each(select_attr_list, function (item) {
      if (!item.mandatory && item.display_status) {
        display_attr_list.push(item);
      }
    });

    this.options.attr('select_attr_list', select_attr_list);
    this.options.attr('display_attr_list', display_attr_list);
    this.setup_column_width();
    this.init_child_tree_display(model);
  },

  init: function (el, opts) {
    var setAllowMapping;

    this.element.closest('.widget').on('widget_hidden', this.widget_hidden.bind(this));
    this.element.closest('.widget').on('widget_shown', this.widget_shown.bind(this));
    CMS.Models.DisplayPrefs.getSingleton().then(function (display_prefs) {
      var allowed;
      // TODO: Currently Query API doesn't support CustomAttributable.
      var isCustomAttr = /CustomAttr/.test(this.options.model.shortName);

      this.display_prefs = display_prefs;
      this.options.filter_is_hidden = this.display_prefs.getFilterHidden();

      this.element.uniqueId();

      this.options.attr('is_subtree',
        this.element && this.element.closest('.inner-tree').length > 0);

      if (!this.options.attr('is_subtree') && !isCustomAttr) {
        this.page_loader = new GGRC.ListLoaders.TreePageLoader(this.options.model,
          this.options.parent_instance, this.options.mapping);
      }

      if ('parent_instance' in opts && 'status' in opts.parent_instance) {
        setAllowMapping = function () {
          var is_accepted = opts.parent_instance.attr('status') === 'Accepted';
          var admin = Permission.is_allowed('__GGRC_ADMIN__');
          this.options.attr('allow_mapping_or_creating', (admin || !is_accepted) &&
                            (this.options.allow_mapping || this.options.allow_creating));
        }.bind(this);
        setAllowMapping();
        opts.parent_instance.bind('change', setAllowMapping);
      } else {
        this.options.attr('allow_mapping_or_creating',
          this.options.allow_mapping || this.options.allow_creating);
      }

      if (this.element.parent().length === 0 || // element not attached
          this.element.data('disable-lazy-loading')) { // comment list
        this.options.disable_lazy_loading = true;
      }

      this.options.update_count = _.isBoolean(this.element.data('update-count')) ? this.element.data('update-count') : true;

      if (!this.options.scroll_element) {
        this.options.attr('scroll_element', $('.object-area'));
      }

      // Override nested child options for allow_* properties
      allowed = {};
      this.options.each(function (item, prop) {
        if (prop.indexOf('allow') === 0 && item === false) {
          allowed[prop] = item;
        }
      });
      this.options.attr('child_options', this.options.child_options.slice(0));
      can.each(this.options.child_options, function (options, i) {
        this.options.child_options.attr(i, new can.Observe(can.extend(options.attr(), allowed)));
      }.bind(this));

      this.options.attr('filter_is_hidden', display_prefs.getFilterHidden());

      this._attached_deferred = new $.Deferred();
      if (this.element && this.element.closest('body').length) {
        this._attached_deferred.resolve();
      }
      this.init_display_options(opts);
    }.bind(this));
    // Make sure the parent_instance is not a computable
    if (typeof this.options.parent_instance === 'function') {
      this.options.attr('parent_instance', this.options.parent_instance());
    }
  },

  ' inserted': function () { // eslint-disable-line quote-props
    this._attached_deferred.resolve();
  },

  init_view: function () {
    var dfds = [];

    if (this.options.header_view && this.options.show_header) {
      dfds.push(
        can.view(this.options.header_view, $.when(this.options)).then(
          this._ifNotRemoved(function (frag) {
            this.element.before(frag);
            // TODO: This is a workaround so we can toggle filter. We should refactor this ASAP.
            can.bind.call(
                this.element.parent().find('.filter-trigger > a'),
                'click',
                function () {
                  if (this.display_prefs.getFilterHidden()) {
                    this.show_filter();
                  } else {
                    this.hide_filter();
                  }
                }.bind(this)
            );

            can.bind.call(this.element.parent().find('.widget-col-title[data-field]'),
                          'click',
                          this.sort.bind(this)
                         );
            can.bind.call(this.element.parent().find('.set-tree-attrs'),
                          'click',
                          this.set_tree_attrs.bind(this)
                         );
            can.bind.call(this.element.parent().find('.set-display-object-list'),
                          'click',
                          this.set_tree_display_list.bind(this)
                         );
          }.bind(this))));
    }

    // Init the spinner if items need to be loaded:
    dfds.push(this.init_count().then(function (count) {
      if (!this.element) {
        return;
      }
      if (count()) {
        this._loading_started();
      } else {
        this.element.trigger('loaded');
      }
    }.bind(this)));

    if (this.options.footer_view) {
      dfds.push(
        can.view(this.options.footer_view, this.options,
          this._ifNotRemoved(function (frag) {
            this.element.after(frag);
          }.bind(this))
        ));
    }
    return $.when.apply($.when, dfds);
  },

  init_count: function () {
    var self = this;

    if (this.get_count_deferred) {
      return this.get_count_deferred;
    }
    if (this.options.parent_instance && this.options.mapping) {
      this.get_count_deferred =
        this.options.parent_instance.get_list_counter(this.options.mapping);
    } else if (this.options.list_loader) {
      this.get_count_deferred =
        this.options.list_loader(this.options.parent_instance)
          .then(function (list) {
            return can.compute(function () {
              return list.attr('length');
            });
          });
    }
    if (this.get_count_deferred) {
      this.get_count_deferred.then(this._ifNotRemoved(function (count) {
        if (self.element) {
          can.trigger(self.element, 'updateCount', [count(), self.options.update_count]);
        }
        count.bind('change', self._ifNotRemoved(function () {
          can.trigger(self.element, 'updateCount', [count(), self.options.update_count]);
        }));
      }));
    } else {
      // FIXME: Does this ever happen?
      this.get_count_deferred = $.Deferred();
      this.get_count_deferred.resolve(function () {
        return 0;
      });
    }
    return this.get_count_deferred;
  },

  fetch_list: function () {
    if (this.find_all_deferred) {
      //  Skip, because already done, e.g., display() already called
      return this.find_all_deferred;
    }
    if (can.isEmptyObject(this.options.find_params.serialize())) {
      this.options.find_params.attr(
        'id', this.options.parent_instance ? this.options.parent_instance.id : undefined);
    }

    if (this.options.mapping) {
      if (this.options.parent_instance === undefined) {
        // TODO investigate why is this method sometimes called twice
        return undefined; // not ready, will try again
      }
      this.find_all_deferred =
        this.options.parent_instance.get_list_loader(this.options.mapping);
    } else if (this.options.list_loader) {
      this.find_all_deferred =
        this.options.list_loader(this.options.parent_instance);
    } else {
      console.debug('Unexpected code path', this);
    }

    return this.find_all_deferred;
  },

  display_path: function (path) {
    return this.display().then(this._ifNotRemoved(function () {
      return _display_tree_subpath(this.element, path);
    }.bind(this)));
  },

  prepare_child_options: function (v, force_reload) {
    //  v may be any of:
    //    <model_instance>
    //    { instance: <model instance>, mappings: [...] }
    //    <TreeOptions>
    var tmp;
    var that = this;
    var original = v;
    if (v._child_options_prepared && !force_reload) {
      return v._child_options_prepared;
    }
    if (!(v instanceof can.Observe.TreeOptions)) {
      tmp = v;
      v = new can.Observe.TreeOptions();
      v.attr('instance', tmp);
      this.options.each(function (val, k) {
        if (can.inArray(k, that.constructor.do_not_propagate) === -1) {
          v.attr(k, val);
        }
      });
    }
    if (!(v.instance instanceof can.Model)) {
      if (v.instance.instance instanceof can.Model) {
        v.attr('result', v.instance);
        v.attr('mappings', v.instance.mappings_compute());
        v.attr('instance', v.instance.instance);
      } else {
        v.attr('instance', this.options.model.model(v.instance));
      }
    }
    v.attr('child_count', can.compute(function () {
      var total_children = 0;
      if (v.attr('child_options')) {
        can.each(v.attr('child_options'), function (child_options) {
          var list = child_options.attr('list');
          if (list) {
            total_children += list.attr('length');
          }
        });
      }
      return total_children;
    }));
    original._child_options_prepared = v;
    return v;
  },
  el_position: function (el) {
    var se = this.options.scroll_element;
    var se_o = se.offset().top;
    var se_h = se.outerHeight();
    var el_o;
    var el_h;
    var above_top;
    var below_bottom;
    if (!(el instanceof jQuery)) {
      el = $(el);
    }
    el_o = el.offset().top;
    el_h = el.outerHeight();
    above_top = (el_o + el_h - se_o) / se_h;
    below_bottom = (el_o - se_o) / se_h - 1;
    if (above_top < 0) {
      return above_top;
    } else if (below_bottom > 0) {
      return below_bottom;
    }
    return 0;
  },
  draw_visible_call_count: 0,
  draw_visible: _.debounce(function () {
    var MAX_STEPS = 100;
    var elPosition;
    var children;
    var lo;
    var hi;
    var max;
    var steps;
    var visible;
    var alreadyVisible;
    var toRender;
    var i;
    var control;
    var index;
    var pageCount;
    var mid;
    var pos;
    var options = this.options;

    if (options.disable_lazy_loading ||
        !this.element ||
        options.attr('drawingItems')) {
      return;
    }
    elPosition = this.el_position.bind(this);
    children = options.attr('filteredList');
    lo = 0;
    hi = children.length - 1;
    max = hi;
    steps = 0;
    visible = [];
    toRender = [];

    if (!children.length || !children[0].element) {
      return;
    }
    alreadyVisible = _.filter(children, function (child) {
      return !child.options.attr('isPlaceholder');
    });

    while (steps < MAX_STEPS && lo < hi) {
      steps += 1;
      mid = (lo + hi) / 2 | 0;
      pos = elPosition(children[mid].element);
      if (pos < 0) {
        lo = mid;
        continue;
      }
      if (pos > 0) {
        hi = mid;
        continue;
      }
      lo = mid;
      hi = mid;
    }
    pageCount = options.scroll_page_count;
    while (lo > 0 && elPosition(children[lo - 1].element) >= (-pageCount)) {
      lo -= 1;
    }
    while (hi < max && elPosition(children[hi + 1].element) <= pageCount) {
      hi += 1;
    }

    _.each(alreadyVisible, function (control) {
      if (!control) {
        return;
      }
      if (Math.abs(elPosition(control.element)) <= pageCount) {
        visible.push(control);
      } else {
        control.draw_placeholder();
      }
    });

    for (i = lo; i <= hi; i++) {
      index = this._is_scrolling_up ? (hi - (i - lo)) : i;
      control = children[index];
      if (!control) {
        // TODO this should not be necessary
        // draw_visible is called too soon when controllers are not yet
        // available and then again when they are. Remove the too soon
        // invocation and this continue can be dropped too.
        continue;
      }
      if (!_.contains(visible, control)) {
        visible.push(control);
        toRender.push(control);
      }
    }
    this.renderStep(toRender, ++this.draw_visible_call_count);
  }, 100, {leading: true}),
  renderStep: function renderStep(toRender, count) {
    // If there is nothing left to render or if draw_visible was run while
    // rendering we simply terminate.
    if (toRender.length === 0 || this.draw_visible_call_count > count) {
      return;
    }
    toRender[0].draw_node();
    setTimeout(function () {
      renderStep(toRender.slice(1), count);
    }, 0);
  },
  _last_scroll_top: 0,

  _is_scrolling_up: false,

  '{scroll_element} scroll': function (el, ev) {
    this._is_scrolling_up = this._last_scroll_top > el.scrollTop();
    this._last_scroll_top = el.scrollTop();
    this.draw_visible();
  },

  '{scroll_element} resize': function (el, ev) {
    setTimeout(this.draw_visible.bind(this), 0);
  },

  '.tree-item-placeholder click': function (el, ev) {
    var node = el.control();
    node.draw_node();
    node.select();
  },

  '{original_list} add': function (list, ev, newVals, index) {
    var that = this;
    var real_add = [];

    can.each(newVals, function (newVal) {
      var _newVal = newVal.instance ? newVal.instance : newVal;
      if (that.oldList && ~can.inArray(_newVal, that.oldList)) {
        that.oldList.splice(can.inArray(_newVal, that.oldList), 1);
      } else if (that.element) {
        real_add.push(newVal);
      }
    });
    this.enqueue_items(real_add);
  },

  '{original_list} remove': function (list, ev, oldVals, index) {
    var remove_marker = {}; // Empty object used as unique marker

    //  FIXME: This assumes we're replacing the entire list, and corrects for
    //    instances being removed and immediately re-added.  This should be
    //    changed to support exact mirroring of the order of
    //    `this.options.list`.
    if (!this.oldList) {
      this.oldList = [];
    }
    this.oldList.push.apply(
        this.oldList,
        can.map(oldVals, function (v) {
          return v.instance ? v.instance : v;
        }));

    // `remove_marker` is to ensure that removals are not attempted until 20ms
    //   after the *last* removal (e.g. for a series of removals)
    this._remove_marker = remove_marker;
    setTimeout(this._ifNotRemoved(function () {
      if (this._remove_marker === remove_marker) {
        can.each(this.oldList, function (v) {
          this.element.trigger('removeChild', v);
        }.bind(this));
        this.oldList = null;
        this._remove_marker = null;

        // TODO: This is a workaround. We need to update communication between
        //       info-pin and tree views through Observer
        if (!this.element.closest('.cms_controllers_info_pin').length) {
          $('.cms_controllers_info_pin').control().unsetInstance();
        }
        this.show_info_pin();
      }
    }.bind(this)), 200);
  },

  '.tree-structure subtree_loaded': function (el, ev) {
    var instance_id;
    var parent;
    ev.stopPropagation();
    instance_id = el.closest('.tree-item').data('object-id');
    parent = can.reduce(this.options.list, function (a, b) {
      switch (true) {
        case !!a : return a;
        case b.instance.id === instance_id: return b;
        default: return null;
      }
    }, null);
    if (parent && !parent.children_drawn) {
      parent.attr('children_drawn', true);
    }
  },
  // add child options to every item (TreeViewOptions instance) in the drawing list at this level of the tree.
  add_child_lists: function (list) {
    var that = this;
    var currentList = can.makeArray(list);
    var listWindow = [];
    var finalDfd;
    var queue = [];
    var BATCH = 200;
    var opId = this._add_child_lists_id = (this._add_child_lists_id || 0) + 1;

    can.each(currentList, function (item) {
      listWindow.push(item);
      if (listWindow.length >= BATCH) {
        queue.push(listWindow);
        listWindow = [];
      }
    });
    if (listWindow.length > 0) {
      queue.push(listWindow);
    }
    this.options.attr('filter_shown', 0);
    this.options.attr('filteredList', []);
    finalDfd = _.foldl(queue, function (dfd, listWindow) {
      return dfd.then(function () {
        var res = $.Deferred();
        if (that._add_child_lists_id !== opId) {
          return dfd;
        }
        setTimeout(function () {
          var draw;
          var drawDfd;
          if (that._add_child_lists_id !== opId) {
            return;
          }
          draw = that._ifNotRemoved(that.draw_items.bind(that));

          drawDfd = draw(listWindow);

          if (drawDfd) {
            drawDfd.then(res.resolve);
          } else {
            res.resolve();
          }
        }, 0);
        return res;
      });
    }, $.Deferred().resolve());

    finalDfd.done(this._ifNotRemoved(function () {
      var shown = this.element[0].children.length;
      var count = this.options.list.length;
      // We need to hide `of` in case the numbers are same
      if (shown === count && shown > 0) {
        shown = false;
      } else {
        shown = shown.toString();
      }
      this.options.attr('filter_shown', shown);
      this.options.attr('filter_count', count.toString());
      this.element.parent().find('.sticky').Stickyfill();
    }.bind(this)));
    return finalDfd;
  },
  draw_items: function (optionsList) {
    var items;
    var $footer = this.element.children('.tree-item-add').first();
    var drawItemsDfds = [];
    var filteredItems = this.options.attr('filteredList') || [];
    var res;

    items = can.makeArray(optionsList);

    items = _.map(items, function (options) {
      var control;
      var elem = document.createElement('li');
      if (this.options.disable_lazy_loading) {
        options.disable_lazy_loading = true;
      }
      control = new CMS.Controllers.TreeViewNode(elem, options);
      drawItemsDfds.push(control._draw_node_deferred);
      filteredItems.push(control);
      return control.element[0];
    }.bind(this));

    if ($footer.length) {
      $(items).insertBefore($footer);
    } else {
      this.element.append(items);
    }
    if (this.options.sortable) {
      $(this.element).sortable({element: 'li.tree-item', handle: '.drag'});
    }
    this.options.attr('filteredList', filteredItems);
    res = $.when.apply($, drawItemsDfds);

    res.then(function () {
      _.defer(this.draw_visible.bind(this));
    }.bind(this));
    return res;
  },

  ' removeChild': function (el, ev, data) { // eslint-disable-line quote-props
    var that = this;
    var instance;

    if (data.instance && data.instance instanceof this.options.model) {
      instance = data.instance;
    } else {
      instance = data;
    }

    //  FIXME: This should be done using indices, when the order of elements
    //    is guaranteed to mirror the order of `this.options.list`.

    //  Replace the list with the list sans the removed instance
    that.options.list.replace(
      can.map(this.options.list, function (options, i) {
        if (options.instance !== instance) {
          return options;
        }
      }));

    //  Remove items by data attributes
    that.element.children([
      '[data-object-id=' + instance.id + ']',
      '[data-object-type=' + instance.constructor.table_singular + ']'
    ].join('')).remove();
    ev.stopPropagation();
  },

  ' updateCount': function (el, ev) { // eslint-disable-line quote-props
    // Suppress events from sub-trees
    if (!($(ev.target).closest('.' + this.constructor._fullName).is(this.element))) {
      ev.stopPropagation();
    }
  },

  widget_hidden: function (event) {
    if (this.options.original_list) {
      this.element.children('.cms_controllers_tree_view_node').remove();
    }
    if (this._add_child_lists_id) {
      this._add_child_lists_id += 1;
    }

    // Remove listeners for inactive tabs
    CMS.Models.Relationship.unbind('created', this.onCreatedRS);
    CMS.Models[this.options.model.shortName].unbind('created',
      this.onCreated);
    CMS.Models.Relationship.unbind('destroyed', this.onDestroyedRS);
    CMS.Models[this.options.model.shortName].unbind('destroyed',
      this.onDestroyedModel);

    return false;
  },

  widget_shown: function (event) {
    if (this.options.original_list) {
      setTimeout(this.reload_list.bind(this), 0);
    }

    this.onCreatedRS = this.onCreatedRS.bind(this);
    this.onCreatedModel = this.onCreatedModel.bind(this);
    this.onDestroyedRS = this.onDestroyedRS.bind(this);
    this.onDestroyedModel = this.onDestroyedModel.bind(this);

    // Add listeners on creations instance or mappings objects for current tab
    // and refresh page after that.
    CMS.Models.Relationship.bind('created', this.onCreatedRS);
    CMS.Models[this.options.model.shortName].bind('created',
      this.onCreatedModel);
    CMS.Models.Relationship.bind('destroyed', this.onDestroyedRS);
    CMS.Models[this.options.model.shortName].bind('destroyed',
      this.onDestroyedModel);

    return false;
  },

  _verifyRelationship: function (instance) {
    return _.includes([instance.destination.type, instance.source.type],
      this.options.model.shortName);
  },

  onCreatedRS: function (ev, instance) {
    var onCreated = this.onCreated.bind(this);
    var parentInstance = this.options.parent_instance;
    function callback() {
      parentInstance.unbind('change', callback);
      onCreated();
    }
    if (instance instanceof CMS.Models.Relationship &&
      this._verifyRelationship(instance)) {
      parentInstance.on('change', callback);
    }
  },

  onCreatedModel: function (ev, instance) {
    if (instance instanceof CMS.Models[this.options.model.shortName]) {
      this.onCreated();
    }
  },

  onCreated: _.debounce(function () {
    this.options.attr('paging.sortDirection', 'desc');
    this.options.attr('paging.sortBy', 'updated_at');
    this.options.attr('paging.current', 1);
    this.refreshList();
  }),

  onDestroyedRS: function (ev, instance) {
    if (instance instanceof CMS.Models.Relationship &&
      this._verifyRelationship(instance)) {
      this.onDestroyed();
    }
  },

  onDestroyedModel: function (ev, instance) {
    if (instance instanceof CMS.Models[this.options.model.shortName]) {
      this.onDestroyed();
    }
  },

  onDestroyed: function () {
    var current;
    if (this.options.attr('original_list').length === 1) {
      current = this.options.attr('paging.current');
      this.options.attr('paging.current', current > 1 ? current - 1 : 1);
    }
    this.refreshList();
    // TODO: This is a workaround. We need to update communication between
    //       info-pin and tree views through Observer
    if (!this.element.closest('.cms_controllers_info_pin').length) {
      $('.cms_controllers_info_pin').control().unsetInstance();
    }
    this.show_info_pin();
  },

  '.edit-object modal:success': function (el, ev, data) {
    var model = el.closest('[data-model]').data('model');
    model.attr(data[model.constructor.root_object] || data);
    ev.stopPropagation();
  },

  reload_list: function (force_reload) {
    if (this.options.list === undefined || this.options.list === null) {
      return;
    }
    this._draw_list_deferred = false;
    this._is_scrolling_up = false;
    this.find_all_deferred = false;
    this.get_count_deferred = false;
    this.options.list.replace([]);
    this.element.children('.cms_controllers_tree_view_node').remove();
    this.draw_list(this.options.original_list, true, force_reload);
    this.init_count();
  },

  '[custom-event] click': function (el, ev) {
    var event_name = el.attr('custom-event');
    if (this.options.events && typeof this.options.events[event_name] === 'function') {
      this.options.events[event_name].apply(this, arguments);
    }
  },

  hide_filter: function () {
    var $filter = this.element.parent().find('.tree-filter');
    var height = $filter.height();
    var margin = $filter.css('margin-bottom').replace('px', '');

    $filter
        .data('height', height)
        .data('margin-bottom', margin)
        .css({
          'margin-bottom': 0,
          height: 0,
          overflow: 'hidden'
        });

    this.element.parent().find('.filter-trigger > a')
        .removeClass('active')
        .find('i')
        .attr('data-original-title', 'Show filter');

    this.element.parent().find('.sticky.tree-header').addClass('no-filter');
    Stickyfill.rebuild();

    this.display_prefs.setFilterHidden(true);
    this.display_prefs.save();
  },

  show_filter: function () {
    var $filter = this.element.parent().find('.tree-filter');

    $filter
        .css({
          'margin-bottom': $filter.data('margin-bottom'),
          height: $filter.data('height'),
          overflow: ''
        });

    this.element.parent().find('.filter-trigger > a')
        .addClass('active')
        .find('i')
        .attr('data-original-title', 'Hide filter');

    this.element.parent().find('.sticky.tree-header').removeClass('no-filter');
    Stickyfill.rebuild();

    this.display_prefs.setFilterHidden(false);
    this.display_prefs.save();
  },

  /* Update the tree attributes as selected by the user CORE-1546
  */
  set_tree_attrs: function () {
    // update the display attrbute list and re-draw
    // 1: find checked items
    // 2. update
    var attr_to_save = [];
    var $check = this.element.parent().find('.attr-checkbox');
    var $selected = $check.filter(':checked');
    var selected_items = [];

    $selected.each(function (index) {
      selected_items.push(this.value);
    });

    can.each(this.options.select_attr_list, function (item) {
      item.display_status = selected_items.indexOf(item.attr_name) !== -1;
    });

    this.options.attr('select_attr_list', this.options.select_attr_list);
    this.options.display_attr_list = [];

    can.each(this.options.select_attr_list, function (item) {
      if (!item.mandatory && item.display_status) {
        this.options.display_attr_list.push(item);
      }
    }, this);
    this.options.attr('display_attr_list', this.options.display_attr_list);
    this.setup_column_width();

    this.reload_list(true);
    // set user preferences for next time
    can.each(this.options.display_attr_list, function (item) {
      attr_to_save.push(item.attr_name);
    });
    this.display_prefs.setTreeViewHeaders(this.options.model.model_singular,
      attr_to_save);
    this.display_prefs.save();

    can.bind.call(this.element.parent().find('.widget-col-title[data-field]'),
      'click',this.sort.bind(this));
  },

  set_tree_display_list: function (ev) {
    var model_name; // = this.options.model.model_singular,
    var $check = this.element.parent().find('.model-checkbox');
    var $selected = $check.filter(':checked');
    var selected_items = [];
    var i;
    var el;
    var open_items;
    var control;
    var tview_el;

    model_name = this.element.parent().find('.object-type-selector').val();

    // save the list
    $selected.each(function (index) {
      selected_items.push(this.value);
    });
    // update GGRC.tree_view
    GGRC.tree_view.sub_tree_for.attr(model_name + '.display_list',
      selected_items);

    // save in local storage
    this.display_prefs.setChildTreeDisplayList(model_name, selected_items);

    // check if any inner tree is open
    el = this.element;
    if (el.hasClass('tree-open')) {
      // find the inner tree and reload it
      open_items = el.find('.item-open .cms_controllers_tree_view');

      for (i = 0; i < open_items.length; i++) {
        tview_el = $(open_items[i]);
        control = tview_el.control();
        if (control) {
          control.reload_list();
        }
      }
    }
  },

  sort: function (event) {
    var $el = $(event.currentTarget);
    var key = $el.data('field');
    var order;

    if (key !== this.options.attr('paging.sortBy')) {
      this.options.attr('paging.sortDirection', null);
    }

    order =
      this.options.attr('paging.sortDirection') === 'asc' ? 'desc' : 'asc';

    this.options.attr('paging.sortDirection', order);
    this.options.attr('paging.sortBy', key);

    $el.closest('.tree-header')
        .find('.widget-col-title')
        .removeClass('asc')
        .removeClass('desc');

    $el.addClass(order);

    this.options.attr('paging.current', 1);
    this.refreshList();
  },

  filter: function (filterString) {
    this.options.attr('paging.filter', filterString);
    this.options.attr('paging.current', 1);
    this.refreshList();
  },

  loadPage: function () {
    var options = this.options;
    var isObjectBrowser = /^\/objectBrowser\/?$/.test(window.location.pathname);
    var isDashboard = /dashboard/.test(window.location);
    var params;
    var relevant;
    if (isObjectBrowser) {
      params = GGRC.Utils.QueryAPI.buildParams(
        options.model.shortName,
        options.paging);
    } else {
      relevant = {
        type: options.parent_instance.type,
        id: options.parent_instance.id
      };
      if (isDashboard) {
        relevant.operation = 'owned';
      }
      params = GGRC.Utils.QueryAPI.buildParams(
        options.model.shortName,
        options.paging,
        relevant
      );
    }

    this._draw_list_deferred = false;
    return this.page_loader.load({data: params})
      .then(function (data) {
        this.options.attr('paging.total', data.total);
        this.options.attr('paging.count',
          Math.ceil(data.total / this.options.paging.pageSize));
        return data.values;
      }.bind(this));
  },
  refreshList: _.debounce(function () {
    this.options.attr('paging.disabled', true);
    this._loading_started();
    this.loadPage()
      .then(function (data) {
        this.element.children('.cms_controllers_tree_view_node').remove();
        return data;
      }.bind(this))
      .then(this._ifNotRemoved(this.proxy('draw_list')))
      .then(function () {
        this.options.attr('paging.disabled', false);
      }.bind(this));
  }),
  '{paging} change': _.debounce(
    function (object, event, type, action, newVal, oldVal) {
      if (oldVal !== newVal && _.contains(['current', 'pageSize'], type)) {
        this.refreshList();
      }
    })
});

can.Control('CMS.Controllers.TreeViewNode', {
  defaults: {
    model: null,
    parent: null,
    instance: null,
    options_property: 'tree_view_options',
    show_view: null,
    expanded: false,
    draw_children: true,
    child_options: []
  }
}, {
  setup: function (el, opts) {
    var that = this;
    if (typeof this._super === 'function') {
      this._super(el);
    }
    if (opts instanceof can.Observe) {
      this.options = opts;
      if (typeof (this.options.model) === 'string') {
        this.options.attr('model', CMS.Models[this.options.model]);
      }
      can.each(this.constructor.defaults, function (v, k) {
        if (!that.options.hasOwnProperty(k)) {
          that.options.attr(k, v);
        }
      });
    } else {
      if (typeof (opts.model) === 'string') {
        opts.model = CMS.Models[opts.model];
      }
      this.options = new can.Observe.TreeOptions(this.constructor.defaults)
      .attr(opts.model ? opts.model[opts.options_property || this.constructor.defaults.options_property] : {})
      .attr(opts);
    }
  },

  init: function (el, opts) {
    if (this.options.instance && !this.options.show_view) {
      this.options.show_view =
        this.options.instance.constructor[this.options.options_property].show_view ||
         this.options.model[this.options.options_property].show_view ||
         GGRC.mustache_path + '/base_objects/tree.mustache';
    }
    this._draw_node_deferred = new $.Deferred();

    if (this.options.child_options) {
      this.options.child_options.each(function (option) {
        option.attr({
          parent: this,
          parent_instance: this.options.instance
        });
      }.bind(this));
    }

    // this timeout is required because the invoker will access the control via
    // the element synchronously so we must not replace the element just yet
    setTimeout(function () {
      if (this.options.disable_lazy_loading) {
        this.draw_node();
      } else {
        this.draw_placeholder();
      }
    }.bind(this), 0);
  },

  '{instance} custom_attribute_values': function (object, ev, newVal, oldVal) {
    function getValues(cav) {
      return _.pluck(cav.reify(), 'attribute_value');
    }
    if (oldVal.length === newVal.length &&
      _.difference(getValues(oldVal), getValues(newVal)).length) {
      this.draw_node(true);
    }
  },

  /**
   * Trigger rendering the tree node in the DOM.
   */
  draw_node: function (force) {
    var isActive;
    var isPlaceholder;
    var lazyLoading = this.options.disable_lazy_loading;

    if (!this.element) {
      return;
    }
    isPlaceholder = this.element.hasClass('tree-item-placeholder');

    if (this._draw_node_in_progress ||
        !force && (!lazyLoading && !isPlaceholder)) {
      return;
    }

    this._draw_node_in_progress = true;

    // the node's isActive state is not stored anywhere, thus we need to
    // determine it from the presemce of the corresponding CSS class
    isActive = this.element.hasClass('active');

    can.view(
      this.options.show_view,
      this.options,
      this._ifNotRemoved(function (frag) {
        this.replace_element(frag);

        if (isActive) {
          this.element.addClass('active');
        }

        this._draw_node_deferred.resolve();
      }.bind(this))
    );
    this.options.attr('isPlaceholder', false);
    this._draw_node_in_progress = false;
  },

  draw_placeholder: function () {
    can.view(
      GGRC.mustache_path + '/base_objects/tree_placeholder.mustache',
      this.options,
      this._ifNotRemoved(function (frag) {
        this.replace_element(frag);
        this._draw_node_deferred.resolve();
        this.options.expanded = false;
        delete this._expand_deferred;
      }.bind(this))
    );
    this.options.attr('isPlaceholder', true);
  },

  should_draw_children: function () {
    var draw_children = this.options.draw_children;
    if (can.isFunction(draw_children)) {
      return draw_children.apply(this.options);
    }
    return draw_children;
  },

  // add all child options to one TreeViewOptions object
  add_child_lists_to_child: function () {
    var originalChildList = this.options.child_options;
    var newChildList = [];

    if (this.options.attr('_added_child_list')) {
      return;
    }
    this.options.attr('child_options', new can.Observe.List());

    if (originalChildList.length === null) {
      originalChildList = [originalChildList];
    }

    if (this.should_draw_children()) {
      can.each(originalChildList, function (data, i) {
        var options = new can.Observe();
        data.each(function (v, k) {
          options.attr(k, v);
        });
        this.add_child_list(this.options, options);
        options.attr({
          options_property: this.options.options_property,
          single_object: false,
          parent: this,
          parent_instance: this.options.instance
        });
        newChildList.push(options);
      }.bind(this));

      this.options.attr('child_options', newChildList);
      this.options.attr('_added_child_list', true);
    }
  },

  // data is an entry from child options.  if child options is an array, run once for each.
  add_child_list: function (item, data) {
    var find_params;
    data.attr({start_expanded: false});
    if (can.isFunction(item.instance[data.property])) {
      // Special case for handling mappings which are functions until
      // first requested, then set their name via .attr('...')
      find_params = function () {
        return item.instance[data.property]();
      };
      data.attr('find_params', find_params);
    } else if (data.property) {
      find_params = item.instance[data.property];
      if (find_params && find_params.isComputed) {
        data.attr('original_list', find_params);
        find_params = find_params();
      } else if (find_params && find_params.length) {
        data.attr('original_list', find_params);
        find_params = find_params.slice(0);
      }
      data.attr('list', find_params);
    } else {
      find_params = data.attr('find_params');
      if (find_params) {
        find_params = find_params.serialize();
      } else {
        find_params = {};
      }
      if (data.parent_find_param) {
        find_params[data.parent_find_param] = item.instance.id;
      } else {
        find_params['parent.id'] = item.instance.id;
      }
      data.attr('find_params', new can.Observe(find_params));
    }
    // $subtree.cms_controllers_tree_view(opts);
  },

  replace_element: function (el) {
    var old_el = this.element;
    var old_data;
    var firstchild;

    if (!this.element) {
      return;
    }

    old_data = $.extend({}, old_el.data());

    firstchild = $(_firstElementChild(el));

    old_data.controls = old_data.controls.slice(0);
    old_el.data('controls', []);
    this.off();
    old_el.replaceWith(el);
    this.element = firstchild.addClass(this.constructor._fullName).data(old_data);
    this.on();
  },

  display: function () {
    return this.trigger_expand();
  },

  display_path: function (path) {
    return this.display().then(this._ifNotRemoved(function () {
      return _display_tree_subpath(this.element, path);
    }.bind(this)));
  },

  display_subtrees: function () {
    var child_tree_dfds = [];
    var that = this;

    this.element.find('.' + CMS.Controllers.TreeView._fullName).each(function (_, el) {
      var $el = $(el);
      var child_tree_control;

      //  Ensure this targets only direct child trees, not sub-tree trees
      if ($el.closest('.' + that.constructor._fullName).is(that.element)) {
        child_tree_control = $el.control();
        if (child_tree_control) {
          child_tree_dfds.push(child_tree_control.display());
        }
      }
    });

    return $.when.apply($, child_tree_dfds);
  },

  /**
   * Expand the tree node to make its subnodes visible.
   *
   * @return {can.Deferred} - a deferred object resolved when all the child
   *   nodes have been loaded and displayed
   */
  expand: function () {
    var $el = this.element;

    this.add_child_lists_to_child();
    if (this._expand_deferred && $el.find('.openclose').is('.active')) {
      // If we have already expanded and are currently still expanded, then
      // short-circuit the call. However, we still need to toggle `expanded`,
      // but if it's the first time expanding, `this.add_child_lists_to_child`
      // *must* be called first.
      this.options.attr('expanded', true);
      return this._expand_deferred;
    }

    this.options.attr('expanded', true);

    this._expand_deferred = new $.Deferred();
    setTimeout(this._ifNotRemoved(function () {
      this.display_subtrees()
        .then(this._ifNotRemoved(function () {
          this.element.trigger('subtree_loaded');
          this.element.trigger('loaded');
          if (this._expand_deferred) {
            this._expand_deferred.resolve();
          }
        }.bind(this)));
    }.bind(this)), 0);
    return this._expand_deferred;
  },

  '.openclose:not(.active) click': function (el, ev) {
    // Ignore unless it's a direct child
    if (el.closest('.' + this.constructor._fullName).is(this.element)) {
      this.expand();
    }
  },

  '.select:not(.disabled) click': function (el, ev) {
    var tree = el.closest('.cms_controllers_tree_view_node');
    var node = tree.control();
    if (node) {
      node.select();
    }
  },

  /**
   * Mark the tree node as active (and all other tree nodes as inactive).
   */
  select: function () {
    var $tree = this.element;

    if ($tree.hasClass('active')) {
      return;  // tree node already selected, no need to activate it again
    }

    $tree.closest('section')
      .find('.cms_controllers_tree_view_node')
      .removeClass('active');

    $tree.addClass('active');

    this.update_hash_fragment();
    $('.pin-content').control().setInstance(this.options.instance, $tree);
  },

  'input,select click': function (el, ev) {
    // Don't toggle accordion when clicking on input/select fields
    ev.stopPropagation();
  },

  trigger_expand: function () {
    var $expand_el = this.element.find('.openclose').first();
    if (!$expand_el.hasClass('active')) {
      $expand_el.trigger('click');
    }
    return this.expand();
  },

  hash_fragment: function () {
    var parent_fragment = '';

    if (this.options.parent) {
      parent_fragment = this.options.parent.hash_fragment();
    }

    return [parent_fragment,
            this.options.instance.hash_fragment()].join('/');
  },

  update_hash_fragment: function () {
    var hash = window.location.hash.split('/')[0];

    window.location.hash = [hash,
                            this.hash_fragment()].join('');
  }
});

(function (can, $) {
  can.Component.extend({
    tag: 'tree-header-selector',
    // <content> in a component template will be replaced with whatever is contained
    //  within the component tag.  Since the views for the original uses of these components
    //  were already created with content, we just used <content> instead of making
    //  new view template files.
    template: '<content/>',
    scope: {},
    events: {
      init: function () {
        this.scope.attr('controller', this);
      },

      disable_attrs: function (el, ev) {
        var MAX_ATTR = 5;
        var $check = this.element.find('.attr-checkbox');
        var $mandatory = $check.filter('.mandatory');
        var $selected = $check.filter(':checked');
        var $not_selected = $check.not(':checked');

        if ($selected.length === MAX_ATTR) {
          $not_selected.prop('disabled', true)
            .closest('li').addClass('disabled');
        } else {
          $check.prop('disabled', false)
            .closest('li').removeClass('disabled');
          // Make sure mandatory items are always disabled
          $mandatory.prop('disabled', true)
            .closest('li').addClass('disabled');
        }
      },

      'input.attr-checkbox click': function (el, ev) {
        this.disable_attrs(el, ev);
        ev.stopPropagation();
      },

      '.dropdown-menu-form click': function (el, ev) {
        ev.stopPropagation();
      },

      '.tview-dropdown-toggle click': function (el, ev) {
        this.disable_attrs(el, ev);
      },

      '.set-tree-attrs,.close-dropdown click': function (el, ev) {
        this.element.find('.dropdown-menu').closest('li').removeClass('open');
      }
    }
  });

  can.Component.extend({
    tag: 'tree-type-selector',
    // <content> in a component template will be replaced with whatever is contained
    //  within the component tag.  Since the views for the original uses of these components
    //  were already created with content, we just used <content> instead of making
    //  new view template files.
    template: '<content/>',
    scope: {},
    events: {
      init: function () {
        this.scope.attr('controller', this);
      },

      'input.model-checkbox click': function (el, ev) {
        ev.stopPropagation();
      },

      '.dropdown-menu-form click': function (el, ev) {
        ev.stopPropagation();
      },

      update_check_boxes: function (el, ev) {
        // change checkboxes based on the model_type
        // get the closest tree_view controller, change the options to reload the checkboxes.
        var i;
        var select_el = this.element.find('.object-type-selector');
        var model_name = select_el.val();
        var sec_el = select_el.closest('section');
        var tree_view_el = sec_el.find('.cms_controllers_tree_view');
        var control = tree_view_el.control();
        var display_list = GGRC.tree_view.sub_tree_for[model_name].display_list;
        var select_model_list = GGRC.tree_view.sub_tree_for[model_name].model_list;
        var obj;

        // set up display status for UI
        for (i = 0; i < select_model_list.length; i++) {
          obj = select_model_list[i];
          obj.display_status = display_list.indexOf(obj.model_name) !== -1;
        }
        control.options.attr('selected_child_tree_model_list', select_model_list);
      },

      'select.object-type-selector change': 'update_check_boxes',

      '.tview-type-toggle click': 'update_check_boxes',

      'a.select-all click': function (el, ev) {
        var $check = this.element.find('.model-checkbox');

        $check.prop('checked', true);
      },

      'a.select-none click': function (el, ev) {
        var $check = this.element.find('.model-checkbox');

        $check.prop('checked', false);
      },

      '.set-display-object-list,.close-dropdown click': function (el, ev) {
        this.element.find('.dropdown-menu').closest('li').removeClass('open');
      }
    }
  });
})(this.can, this.can.$);
