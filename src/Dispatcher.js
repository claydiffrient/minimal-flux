import assign from 'object-assign';
import EventEmitter from 'eventemitter3';
import toposort from 'toposort';
import getAllPropertyNames from 'getallpropertynames';
import extend from './util/extend';
import hasPrefix from './util/hasPrefix';
import Actions from './Actions';
import Store from './Store';

let allObjectProperties = getAllPropertyNames({});
let allActionsProperties = getAllPropertyNames(Actions.prototype);
let eventEmitterProperties = Object.keys(EventEmitter.prototype);

export default class Dispatcher extends EventEmitter {

    /**
     * Constructor
     * @param  {Object} options
     * @param  {Object} options.actions Namespaced actions
     * @param  {Object} options.stores  Namespaced stores
     * @return {Dispatcher}
     */
    constructor(options) {
        super();
        // Wrapped actions
        this.actions = {};
        this.actionIds = [];
        // Wrapped stores
        this.stores = {};
        // Actual stores
        this._stores = {};
        // Order in which actions get dispatched to the stores
        this.order = [];

        let actions = options.actions || {};
        let stores = options.stores || {};

        this.createActions(actions);
        this.createStores(stores);
    }

    /**
     * Dispatches an action
     * @param  {String}    id   The id of the action (e.g. 'todos.create')
     * @param  {...mixed}  args Arguments that will be passed to the handlers
     * @return {void}
     */
    dispatch(id, ...args) {
        if(this._isDispatching) {
            throw new Error('Cannot dispatch in the middle of a dispatch.');
        }

        this._isDispatching = true;

        this.emit('dispatch', id, ...args);

        // Run through stores and invoke registered handlers
        let stores = this._stores;
        for(let i = 0; i < this.order.length; i++) {
            let key = this.order[i];
            let handlers = stores[key]._handlers;
            if(!handlers || !handlers[id]) continue;
            
            try {
                handlers[id](...args);
            } catch(err) {
                this.emit('error', err);
                throw err;
            }
        }

        this._isDispatching = false;
    }

    /**
     * Create actions
     * @param  {Object} actions Namespaced actions
     * @return {void}
     */
    createActions(actions) {
        // Run through namespaced actions
        for(let key in actions) {
            let Actions = actions[key];
            // Make actions available at construction time
            let ExtendedActions = extend(Actions, {
                key: key,
                actions: this.actions,
                stores: this.stores
            });

            // Instantiate actions
            let instance = new ExtendedActions();
            // Create wrapped actions object
            this.actions[key] = {};
            // Find actual action function
            let props = getAllPropertyNames(Actions.prototype).filter((prop) => {
                // Ignore the base class properties
                return allActionsProperties.indexOf(prop) < 0 &&
                    // Only regard functions
                    typeof instance[prop] == 'function';
            });
            // Run through actual actions
            for(let i = 0; i < props.length; i++) {
                let prop = props[i];
                // Bind function to instance
                let fn = instance[prop] = instance[prop].bind(instance);
                // The action id is composed from the actions key and its function name
                let id = [key, prop].join('.');
                this.actionIds.push(id);
                // Listen to the action event
                instance.addListener(prop, this.dispatch.bind(this, id));
                // Add function to the wrapped object
                this.actions[key][prop] = fn;
            }
        }
    }

    /**
     * Check if action id exists
     * @param  {String} id The action id
     * @return {Boolean}
     */
    actionIdExists(id) {
        return this.actionIds.indexOf(id) > -1;
    }

    /**
     * Create stores
     * @param  {Object} stores Namespaced stores
     * @return {void}
     */
    createStores(stores) {
        let nodes = [];
        let edges = [];

        // Create a dependency graph
        for(let key in stores) {
            nodes.push(key);
            let store = stores[key];
            // If store is not an array, it has no dependencies
            if(!Array.isArray(store)) continue;
            let deps = store.slice(1) || [];
            // Add edges between store and it dependencies
            for(let i = 0; i < deps.length; i++) edges.push([key, deps[i]]);
        }

        // Topological sort, store the order
        let order = this.order = toposort.array(nodes, edges).reverse();

        // Run through ordered stores
        for(let i = 0, l = order.length; i < l; i++){
            let key = order[i];
            let Store = stores[key];
            // Handle plain and array definition
            if(Array.isArray(Store)) Store = Store[0];  
            // Make stores available at construction time
            let ExtendedStore = extend(Store, {
                key: key,
                stores: this.stores,
                _actionIdExists: this.actionIdExists.bind(this)
            });
            // Instantiate the store
            let instance = new ExtendedStore();
            this._stores[key] = instance;
            // Create a wrapped stores object
            this.stores[key] = {};
            // Find functions that will be added to the wrapped object
            let props = getAllPropertyNames(Store.prototype).filter((prop) => {
                // Only regard functions
                return typeof instance[prop] === 'function' &&
                    allObjectProperties.indexOf(prop) < 0 &&
                        // Functions that start with get or is
                        (hasPrefix(prop, 'get') || hasPrefix(prop, 'is') || hasPrefix(prop, 'has') ||
                            // Event emitter function, except emit
                            (eventEmitterProperties.indexOf(prop) > -1 && prop !== 'emit'));
            });
            // Run through functions
            for(let i = 0; i < props.length; i++) {
                let prop = props[i];
                // Bind function to the instance and add it to the wrapped object
                this.stores[key][prop] = instance[prop].bind(instance);
            }
        }
    }

}