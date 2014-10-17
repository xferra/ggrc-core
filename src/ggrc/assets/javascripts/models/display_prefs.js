/*!
    Copyright (C) 2013 Google Inc., authors, and contributors <see AUTHORS file>
    Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
    Created By: brad@reciprocitylabs.com
    Maintained By: brad@reciprocitylabs.com
*/

//= require can.jquery-all
//= require models/local_storage

(function(can, $){

var COLLAPSE = "collapse"
, LHN_SIZE = "lhn_size"
, OBJ_SIZE = "obj_size"
, SORTS = "sorts"
, HEIGHTS = "heights"
, COLUMNS = "columns"
, PBC_LISTS = "pbc_lists"
, GLOBAL = "global"
, LHN_STATE = "lhn_state"
, path = window.location.pathname;

can.Model.LocalStorage("CMS.Models.DisplayPrefs", {
  autoupdate : true
  , version : 20140403 // Last updated due to default sort of InnerNav being broken.

  , findAll : function() {
    var that = this;
    var objs_dfd = this._super.apply(this, arguments)
    .then(function(objs) {
      var i;
      for(i = objs.length; i--;) {
        if(!objs[i].version || objs[i].version < that.version) {
          objs[i].destroy();
          objs.splice(i, 1);
        }
      }
      return objs;
    });
    return objs_dfd;
  }

  , findOne : function() {
    var that = this;
    var obj_dfd = this._super.apply(this, arguments)
    .then(function(obj) {
      var dfd, p;
      if(!obj.version || obj.version < that.version) {
        obj.destroy();
        dfd = new $.Deferred();
        p = dfd.promise();
        p.status = 404;
        return dfd.reject(p, "error", "Object expired");
      } else {
        return obj;
      }
    });
    return obj_dfd;
  }

  , create : function(opts) {
    opts.version = this.version;
    return this._super(opts);
  }

  , update : function(id, opts) {
    opts.version = this.version;
    return this._super(id, opts);
  }
}, {
  init : function() {
    this.autoupdate = this.constructor.autoupdate;
  }

  , makeObject : function() {
    var retval = this;
    var args = can.makeArray(arguments);
    can.each(args, function(arg) {
      var tval = can.getObject(arg, retval);
      if(!tval || !(tval instanceof can.Observe)) {
        tval = new can.Observe(tval);
        retval.attr(arg, tval);
      }
      retval = tval;
    });
    return retval;
  }

  , getObject : function() {
    var args = can.makeArray(arguments);
    args[0] === null && args.splice(0,1);
    return can.getObject(args.join("."), this);
  }

  // collapsed state
  // widgets on a page may be collapsed such that only the title bar is visible.
  // if page_id === null, this is a global value
  , setCollapsed : function(page_id, widget_id, is_collapsed) {
    this.makeObject(page_id === null ? page_id : path, COLLAPSE).attr(widget_id, is_collapsed);

    this.autoupdate && this.save();
    return this;
  }

  , getCollapsed : function(page_id, widget_id) {
    var collapsed = this.getObject(page_id === null ? page_id : path, COLLAPSE);
    if(!collapsed) {
      collapsed = this.makeObject(page_id === null ? page_id : path, COLLAPSE).attr(this.makeObject(COLLAPSE, page_id).serialize());
    }

    return widget_id ? collapsed.attr(widget_id) : collapsed;
  }

  , setLHNavSize : function(page_id, widget_id, size) {
    this.makeObject(page_id === null ? page_id : path, LHN_SIZE).attr(widget_id, size);
    this.autoupdate && this.save();
    return this;
  }

  , getLHNavSize : function(page_id, widget_id) {
    var size = this.getObject(page_id === null ? page_id : path, LHN_SIZE);
    if(!size) {
      size = this.makeObject(page_id === null ? page_id : path, LHN_SIZE).attr(this.makeObject(LHN_SIZE, page_id).serialize());
    }

    return widget_id ? size.attr(widget_id) : size;
  }
  , setGlobal : function(widget_id, attrs) {
    var global = this.getObject(null, GLOBAL) && this.getObject(null, GLOBAL).attr(widget_id);
    if (!global) {
      global = this.makeObject(null, GLOBAL).attr(widget_id, new can.Observe(attrs));
    }
    else {
      global.attr(attrs);
    }
    this.autoupdate && this.save();
    return this;
  }

  , getGlobal : function(widget_id) {
    return this.getObject(null, GLOBAL) && this.getObject(null, GLOBAL).attr(widget_id);
  }

  // sorts = position of widgets in each column on a page
  // This is also use at page load to determine which widgets need to be
  // generated client-side.
  , getSorts : function(page_id, column_id) {
    var sorts = this.getObject(path, SORTS);
    if(!sorts) {
      sorts = this.makeObject(path, SORTS).attr(this.makeObject(SORTS, page_id).serialize());
      this.autoupdate && this.save();
    }

    return column_id ? sorts.attr(column_id) : sorts;
  }

  , setSorts : function(page_id, widget_id, sorts) {
    if(typeof sorts === "undefined" && typeof widget_id === "object") {
      sorts = widget_id;
      widget_id = undefined;
    }
    var page_sorts = this.makeObject(path, SORTS);

    page_sorts.attr(widget_id ? widget_id : sorts, widget_id ? sorts : undefined);

    this.autoupdate && this.save();
    return this;
  }

  // heights : height of widgets to restore on page start.
  // Is set by jQuery-UI resize functions in ResizeWidgetsController
  , getWidgetHeights : function(page_id) {
    var heights = this.getObject(path, HEIGHTS);
    if(!heights) {
      heights = this.makeObject(path, HEIGHTS).attr(this.makeObject(HEIGHTS, page_id).serialize());
      this.autoupdate && this.save();
    }
    return heights;
  }

  , getWidgetHeight : function(page_id, widget_id) {
    return this.getWidgetHeights(page_id)[widget_id];
  }

  , setWidgetHeight : function(page_id, widget_id, height) {
    var page_heights = this.makeObject(path, HEIGHTS);

    page_heights.attr(widget_id, height);

    this.autoupdate && this.save();
    return this;
  }

  // columns : the relative width of columns on each page.
  //  should add up to 12 since we're using row-fluid from Bootstrap
  , getColumnWidths : function(page_id, content_id) {
    var widths = this.getObject(path, COLUMNS);
    if(!widths) {
      widths = this.makeObject(path, COLUMNS).attr(this.makeObject(COLUMNS, page_id).serialize());
      this.autoupdate && this.save();
    }
    return widths[content_id];
  }

  , getColumnWidthsForSelector : function(page_id, sel) {
    return this.getColumnWidths(page_id, $(sel).attr("id"));
  }

  , setColumnWidths : function(page_id, widget_id, widths) {
    var csp = this.makeObject(path, COLUMNS);
    csp.attr(widget_id, widths);
    this.autoupdate && this.save();
    return this;
  }

  // reset function currently resets all layout for a page type (first element in URL path)
  , resetPagePrefs : function() {
    this.removeAttr(path);
    return this.save();
  }

  , setPageAsDefault : function(page_id) {
    var that = this;
    can.each([COLLAPSE, LHN_SIZE, OBJ_SIZE, SORTS, HEIGHTS, COLUMNS], function(key) {
      that.makeObject(key).attr(page_id, new can.Observe(that.makeObject(path, key).serialize()));
    });
    this.save();
    return this;
  }

  , getPbcListPrefs : function(pbc_id) {
    return this.makeObject(PBC_LISTS, pbc_id);
  }

  , setPbcListPrefs : function(pbc_id, prefs) {
    this.makeObject(PBC_LISTS).attr(pbc_id, prefs instanceof can.Observe ? prefs : new can.Observe(prefs));
    this.autoupdate && this.save();
  }

  , getPbcResponseOpen : function(pbc_id, response_id) {
    return this.makeObject(PBC_LISTS, pbc_id, "responses").attr(response_id);
  }

  , getPbcRequestOpen : function(pbc_id, request_id) {
    return this.makeObject(PBC_LISTS, pbc_id, "requests").attr(request_id);
  }

  , setPbcResponseOpen : function(pbc_id, response_id, is_open) {
    var prefs = this.makeObject(PBC_LISTS, pbc_id, "responses").attr(response_id, is_open);

    this.autoupdate && this.save();
    return this;
  }

  , setPbcRequestOpen : function(pbc_id, request_id, is_open) {
    var prefs = this.makeObject(PBC_LISTS, pbc_id, "requests").attr(request_id, is_open);

    this.autoupdate && this.save();
    return this;
  }

  , getLHNState : function() {
    return this.makeObject(LHN_STATE);
  }

  , setLHNState : function(new_prefs, val) {
    var prefs = this.makeObject(LHN_STATE);
    can.each(
      ["open_category", "panel_scroll", "category_scroll", "search_text", "my_work", "filter_params"]
      , function(token) {
        if(typeof new_prefs[token] !== "undefined") {
          prefs.attr(token, new_prefs[token]);
        } else if(new_prefs === token && typeof val !== "undefined") {
          prefs.attr(token, val);
        }
      }
    );

    this.autoupdate && this.save();
    return this;
  }

});

if(typeof jasmine !== "undefined") {
  CMS.Models.DisplayPrefs.exports = {
    COLLAPSE : COLLAPSE
    , SORTS : SORTS
    , HEIGHTS : HEIGHTS
    , COLUMNS : COLUMNS
    , GLOBAL : GLOBAL
    , PBC_LISTS : PBC_LISTS
    , path : path
  };
}

})(this.can, this.can.$);
