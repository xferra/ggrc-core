/*!
 Copyright (C) 2017 Google Inc.
 Licensed under http://www.apache.org/licenses/LICENSE-2.0 <see LICENSE file>
 */
(function (can, $, GGRC) {
  GGRC.Controllers.Modals('GGRC.Controllers.QuickForm', {
    defaults: {
      model: null,
      instance: null
    }
  }, {
    init: function () {
      if (this.options.instance && !this.options.model) {
        this.options.model = this.options.instance.constructor;
      }
      this.options.$content = this.element;
      if (this.element.data('force-refresh')) {
        this.options.instance.refresh();
      }
    },
    'input, textarea, select change': function (el) {
      var self = this;
      var val;
      var prop;
      var oldValue;
      if (el.data('toggle') === 'datepicker') {
        val = el.datepicker('getDate');
        prop = el.attr('name');
        oldValue = this.options.instance.attr(prop);

        if (moment(val).isSame(oldValue)) {
          return;
        }
        can.when(this.options.instance.refresh()).then(function () {
          self.options.instance.attr(prop, val);
          self.options.instance.save();
        });
        return;
      }
      if (!el.is('[data-lookup]')) {
        this.set_value_from_element(el);
        setTimeout(function () {
          this.options.instance.save();
        }.bind(this), 100);
      }
    },
    autocomplete_select: function (el, event, ui) {
      var self = this;
      var prop = el.attr('name').split('.').slice(0, -1).join('.');
      if (this._super.apply(this, arguments) !== false) {
        setTimeout(function () {
          self.options.instance.save().then(function () {
            var obj = self.options.instance.attr(prop);
            if (obj.attr) {
              obj.attr('saved', true);
            }
          });
        }, 100);
      } else {
        return false;
      }
    },
    'input, select, textarea click': function (el, ev) {
      if (el.data('toggle') === 'datepicker') {
        return;
      }
      if (this._super) {
        this._super.apply(this, arguments);
      }
      ev.stopPropagation();
    },
    '.dropdown-menu > li click': function (el, ev) {
      var self = this;
      ev.stopPropagation();
      this.set_value({name: el.data('name'), value: el.data('value')});
      setTimeout(function () {
        self.options.instance.save();
        $(el).closest('.open').removeClass('open');
      }, 100);
    },
    'button[data-name][data-value]:not(.disabled), a.undoable[data-toggle*=modal] click': function (el, ev) {
      var self = this;
      var name = el.data('name');
      var oldValue = {};
      var action;
      var openclose;
      var isOpened;

      if (el.data('openclose')) {
        action = el.data('openclose');
        openclose = el.closest('.item-main').find('.openclose');
        isOpened = openclose.hasClass('active');

        // We can't use main.openclose(action) here because content may not be loaded yet
        if (action === 'trigger') {
          openclose.trigger('click');
        } else if (action === 'close' && isOpened) {
          openclose.trigger('click');
        } else if (action === 'open' && !isOpened) {
          openclose.trigger('click');
        }
      }

      oldValue[name] = this.options.instance.attr(name);
      if (el.data('also-undo')) {
        can.each(el.data('also-undo').split(','), function (attrname) {
          attrname = attrname.trim();
          oldValue[attrname] = self.options.instance.attr(attrname);
        });
      }

      // Check if the undo button was clicked:
      self.options.instance.attr('_undo') || self.options.instance.attr('_undo', []);

      if (el.is('[data-toggle*=modal')) {
        setTimeout(function () {
          $('.modal:visible').one('modal:success', function () {
            self.options.instance.attr('_undo').unshift(oldValue);
          });
        }, 100);
      } else {
        ev.stopPropagation();
        self.options.instance.attr('_undo').unshift(oldValue);

        self.options.instance.attr('_disabled', 'disabled');
        self.options.instance.refresh().then(function (instance) {
          self.set_value({name: el.data('name'), value: el.data('value')});
          return instance.save();
        }).then(function (instance) {
          self.options.instance.attr('_disabled', '');
        });
      }
    },
    'a.undo click': function (el, ev) {
      var self = this;
      var newValue = this.options.instance.attr('_undo').shift();
      ev.stopPropagation();

      this.options.instance.attr('_disabled', 'disabled');
      this.options.instance
        .refresh()
        .then(function (instance) {
          can.each(newValue, function (value, name) {
            self.set_value({name: name, value: value});
          });
          return instance.save();
        }).then(function () {
          self.options.instance.attr('_disabled', '');
        });
    }
  });
})(window.can, window.can.$, window.GGRC);
