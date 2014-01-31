/**
 * Infinite Ajax Scroll v2.0.0
 * A jQuery plugin for infinite scrolling
 * http://github.com/webcreate/infinite-ajax-scroll
 *
 * Commercial use requires one-time purchase of a commercial license
 * http://github.com/webcreate/infinite-ajax-scroll
 *
 * Non-commercial use is licensed under the MIT License
 *
 * Copyright 2014 Webcreate (Jeroen Fiege)
 */

(function($) {

  'use strict';

  var UNDETERMINED_SCROLLOFFSET = -1;

  var IAS = function($element, options) {
    this.itemsContainerSelector = options.container;
    this.itemSelector = options.item;
    this.nextSelector = options.next;
    this.paginationSelector = options.pagination;
    this.$scrollContainer = $element;
    this.$itemsContainer = $(this.itemsContainerSelector);
    this.$container = (window === $element.get(0) ? $(document) : $element);
    this.defaultDelay = options.delay;
    this.nextUrl = null;
    this.isBound = false;
    this.listeners = {
      next: new IASCallbacks(),
      load: new IASCallbacks(),
      didLoad: new IASCallbacks(),
      render: new IASCallbacks(),
      scroll: new IASCallbacks(),
      noneLeft: new IASCallbacks()
    };
    this.extensions = [];

    /**
     * Scroll event handler
     *
     * Note: calls to this functions should be throttled
     *
     * @private
     */
    this.scrollHandler = function() {
      var currentScrollOffset = this.getCurrentScrollOffset(this.$scrollContainer),
          scrollThreshold = this.getScrollThreshold()
      ;

      // invalid scrollThreshold. The DOM might not have loaded yet...
      if (UNDETERMINED_SCROLLOFFSET == scrollThreshold) {
        return;
      }

      this.fire('scroll', [currentScrollOffset, scrollThreshold]);

      if (currentScrollOffset >= scrollThreshold) {
        this.next();
      }
    };

    /**
     * Returns the last item currently in the DOM
     *
     * @private
     * @returns {object}
     */
    this.getLastItem = function() {
      return $(this.itemSelector, this.$itemsContainer.get(0)).last();
    };

    /**
     * Returns scroll threshold. This threshold marks the line from where
     * IAS should start loading the next page.
     *
     * @todo implement scrollThreshold margin
     *
     * @private
     * @return {number}
     */
    this.getScrollThreshold = function() {
      var lastElement;

      lastElement = this.getLastItem();

      // if the don't have a last element, the DOM might not have been loaded,
      // or the selector is invalid
      if (0 === lastElement.size()) {
        return UNDETERMINED_SCROLLOFFSET;
      }

      return (lastElement.offset().top + lastElement.height());
    };

    /**
     * Returns current scroll offset for the given scroll container
     *
     * @private
     * @param $container
     * @returns {number}
     */
    this.getCurrentScrollOffset = function($container) {
      var scrollTop = 0,
          containerHeight = $container.height();

      if (window === $container.get(0))  {
        scrollTop = $container.scrollTop();
      } else {
        scrollTop = $container.offset().top;
      }

      return (scrollTop + containerHeight);
    };

    /**
     * Returns the url for the next page
     *
     * @private
     */
    this.getNextUrl = function(container) {
      if (!container) {
        container = this.$container;
      }

      return $(this.nextSelector, container).attr('href');
    };

    /**
     * Loads a page url
     *
     * @param url
     * @param callback
     * @param delay
     * @returns {object}        jsXhr object
     */
    this.load = function(url, callback, delay) {
      var self = this,
          $itemContainer,
          items = [],
          timeStart = +new Date(),
          timeDiff;

      delay = delay || this.defaultDelay;

      return $.get(url, null, $.proxy(function(data) {
        $itemContainer = $(this.itemsContainerSelector, data).eq(0);
        if (0 === $itemContainer.length) {
          $itemContainer = $(data).filter(this.itemsContainerSelector).eq(0);
        }

        if ($itemContainer) {
          $itemContainer.find(this.itemSelector).each(function() {
            items.push(this);
          });
        }

        // @todo it's best practise to fire events at the beginning of the method
        self.fire('load', [data, items]);

        if (callback) {
          timeDiff = +new Date() - timeStart;
          if (timeDiff < delay) {
            setTimeout(function() {
              callback.call(self, data, items);
            }, delay - timeDiff);
          } else {
            callback.call(self, data, items);
          }
        }
      }, self), 'html');
    };

    /**
     * Renders items
     *
     * @param items
     */
    this.render = function(items) {
      var lastItem = this.getLastItem();

      this.fire('render', [items]);

      $(items).hide(); // at first, hide it so we can fade it in later

      lastItem.after(items);

      $(items).fadeIn();
    };

    /**
     * Hides the pagination
     */
    this.hidePagination = function() {
      if (this.paginationSelector) {
        $(this.paginationSelector, this.$container).hide();
      }
    };

    /**
     * Restores the pagination
     */
    this.restorePagination = function() {
      if (this.paginationSelector) {
        $(this.paginationSelector, this.$container).show();
      }
    };

    /**
     * Throttles a method
     *
     * Adopted from Ben Alman's jQuery throttle / debounce plugin
     *
     * @param callback
     * @param delay
     * @return {object}
     */
    this.throttle = function(callback, delay) {
      var lastExecutionTime = 0,
          wrapper,
          timerId
      ;

      wrapper = function() {
        var that = this,
            args = arguments,
            diff = +new Date() - lastExecutionTime;

        function execute() {
          lastExecutionTime = +new Date();
          callback.apply(that, args);
        }

        if (!timerId) {
          execute();
        } else {
          clearTimeout(timerId);
        }

        if (diff > delay) {
          execute();
        } else {
          timerId = setTimeout(execute, delay);
        }
      };

      if ($.guid) {
        wrapper.guid = callback.guid = callback.guid || $.guid++;
      }

      return wrapper;
    };

    /**
     * Fires an event with the ability to cancel further processing. This
     * can be achieved by returning false in a listener.
     *
     * @param event
     * @param args
     * @returns {*}
     */
    this.fire = function(event, args) {
      return this.listeners[event].fireWith(this, args);
    };

    return this;
  };

  /**
   * Initialize IAS
   *
   * Note: Should be called when the document is ready
   *
   * @public
   */
  IAS.prototype.initialize = function() {
    this.hidePagination();
    this.bind();

    this.nextUrl = this.getNextUrl();

    return this;
  };

  /**
   * Binds IAS to DOM events
   *
   * @public
   */
  IAS.prototype.bind = function() {
    if (this.isBound) {
      return;
    }

    this.$scrollContainer.on('scroll', $.proxy(this.throttle(this.scrollHandler, 150), this));

    this.isBound = true;
  };

  /**
   * Unbinds IAS to events
   *
   * @public
   */
  IAS.prototype.unbind = function() {
    if (!this.isBound) {
      return;
    }

    this.$scrollContainer.off('scroll', this.scrollHandler);

    this.isBound = false;
  };

  /**
   * Destroys IAS instance
   *
   * @public
   */
  IAS.prototype.destroy = function() {
    this.unbind();
  };

  /**
   * Registers an eventListener
   *
   * Note: chainable
   *
   * @public
   * @returns IAS
   */
  IAS.prototype.on = function(event, callback) {
    if (typeof this.listeners[event] == 'undefined') {
      throw new Error('There is no event called "' + event + '"');
    }

    this.listeners[event].add($.proxy(callback, this));

    return this;
  };

  /**
   * Removes an eventListener
   *
   * Note: chainable
   *
   * @public
   * @returns IAS
   */
  IAS.prototype.off = function(event, callback) {
    if (typeof this.listeners[event] == 'undefined') {
      throw new Error('There is no event called "' + event + '"');
    }

    this.listeners[event].remove(callback);

    return this;
  };

  /**
   * Load the next page
   *
   * @public
   */
  IAS.prototype.next = function() {
    var url = this.nextUrl,
        self = this;

    if (!url) {
      this.unbind();

      this.fire('noneLeft', [this.getLastItem()]);

      return false;
    }

    this.unbind();

    var promise = this.fire('next', [url]);

    promise.done(function() {
      self.load(url, function(data, items) {
        self.render(items);

        self.nextUrl = self.getNextUrl(data);

        self.bind();
      });
    });

    promise.fail(function() {
      self.bind();
    });

    return true;
  };

  /**
   * Adds an extension
   *
   * @public
   */
  IAS.prototype.extension = function(extension) {
    if (typeof extension['bind'] == 'undefined') {
      throw new Error('Extension doesn\'t have required method "bind"');
    }

    extension.bind(this);

    this.extensions.push(extension);

    return this;
  };

  /**
   * Shortcut. Sets the window as scroll container.
   *
   * @public
   * @param option
   * @returns {*}
   */
  $.ias = function(option) {
    var $window = $(window);

    return $window.ias.apply($window, arguments);
  };

  /**
   * jQuery plugin initialization
   *
   * @public
   * @param option
   * @returns {*} the last IAS instance will be returned
   */
  $.fn.ias = function(option) {
    var args = Array.prototype.slice.call(arguments);
    var retval = this;

    this.each(function() {
      var $this = $(this),
          data = $this.data('ias'),
          options = $.extend({}, $.fn.ias.defaults, $this.data(), typeof option == 'object' && option)
      ;

      // set a new instance as data
      if (!data) {
        $this.data('ias', (data = new IAS($this, options)));

        $(document).ready($.proxy(data.initialize, data));
      }

      // when the plugin is called with a method
      if (typeof option === 'string') {
        if (typeof data[option] !== 'function') {
          throw new Error('There is no method called "' + option + '"');
        }

        args.shift(); // remove first argument ('option')
        data[option].apply(data, args);

        if (option === 'destroy') {
          $this.data('ias', null);
        }
      }

      retval = $this.data('ias');
    });

    return retval;
  };

  /**
   * Plugin defaults
   *
   * @public
   * @type {object}
   */
  $.fn.ias.defaults = {
    item: '.item',
    container: '.listing',
    next: '.next',
    pagination: false,
    delay: 600
  };
})(jQuery);