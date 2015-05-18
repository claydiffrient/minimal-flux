import test from 'tape';
import Dispatcher from './../../src/Dispatcher';
import Actions from './../../src/Actions';
import Store from './../../src/Store';

test('Store: resolve stores', (t) => {

    let constructed = [];
    let barStoreFoo;

    class FooStore extends Store {
        constructor() {
            super();
            constructed.push('foo');
        }
    }
    class BarStore extends Store {
        constructor() {
            super();
            constructed.push('bar');
            barStoreFoo = this.stores.foo;
        }
    }
    class BazStore extends Store {
        constructor() {
            super();
            constructed.push('baz'); 
        }
    }

    let flux = new Dispatcher({
        stores: {
            foo: FooStore,
            bar: [BarStore, 'foo', 'baz'],
            baz: BazStore
        }
    });

    t.ok(constructed.indexOf('bar') === 2, 
        'should resolve in a topological order');

    t.ok(barStoreFoo === flux.stores.foo, 
        'should make stores available at construction time');

    t.end();
});

test('Store: circular dependencies', (t) => {

    class FooStore extends Store {}
    class BarStore extends Store {}

    let circle = function() {
        new Dispatcher({
            stores: {
                foo: [FooStore, 'bar'],
                bar: [BarStore, 'foo']
            }
        });
    };

    t.throws(circle, 'should throw error');
    t.end();
});

test('Store: wrapper', (t) => {

    class FooStore extends Store {
        isFoo() { return true; }
        hasFoo() { return true; }
        getFoo() { return true; }
        isolate() { return true; }
    }

    class BarStore extends FooStore {}

    let flux = new Dispatcher({
        stores: {
            foo: FooStore,
            bar: BarStore
        }
    });

    let store = flux.stores.foo;
    let extendedStore = flux.stores.bar;

    t.notOk(typeof store.setState === 'function',
        'should not expose setters');

    t.ok(typeof store.getState === 'function',
        'should expose getters');

    t.ok(typeof store.getFoo === 'function',
        'should expose `get` getters');

    t.ok(typeof store.isFoo === 'function',
        'should expose `is` getters');

    t.ok(typeof store.hasFoo === 'function',
        'should expose `has` getters');

    t.notOk(typeof store.isolate === 'function',
        'should not expose inaccurate getters');

    t.notOk(store.hasOwnProperty('isPrototypeOf'),
        'should not expose object methods');

    t.ok(typeof store.addListener === 'function',
        'should expose event emitter methods');

    t.ok(typeof extendedStore.getState === 'function',
        'should expose inherited getters');

    t.ok(typeof extendedStore.isFoo === 'function',
        'should expose inherited getters');

    t.end();
});


test('Stores: create store key', (t) => {
    let keyResult;

    class FooStore extends Store {
        constructor() {
            super();
            keyResult = this.key;
        }
    }

    let flux = new Dispatcher({ stores: { foo: FooStore } });

    t.equal(keyResult, 'foo',
        'should assign actions key to actions prototype');

    t.end();
});

test('Store: handleAction()', (t) => {
    let handled = [];

    class FooActions extends Actions {
        foo(foo) { this.dispatch('foo', foo); }
        bar(bar) { this.dispatch('bar', bar); }
    }

    class FooStore extends Store {
        constructor() {
            super();
            this.handleAction('foo.foo', this.handleFooFoo);
            this.handleAction('foo.bar', this.handleFooBar);
        }
        handleFooFoo(...args) {
            handled.push('foo', ...args);
        }
        handleFooBar(...args) {
            handled.push('bar', ...args);
            this.stopHandleAction('foo.bar');
        }
    }

    let flux = new Dispatcher({
        actions: { foo: FooActions },
        stores: { foo: FooStore }
    });

    handled = [];
    flux.actions.foo.foo('foo');
    t.deepEqual(handled, ['foo', 'foo'],
        'should listen to action');

    handled = [];
    flux.actions.foo.bar('bar');
    flux.actions.foo.bar('bar');
    t.deepEqual(handled, ['bar', 'bar'],
        'should stop listen to action');

    t.end();
});

test('Store: handleAction action does not exist', (t) => {
    class FooStore extends Store {
        constructor() {
            super();
            this.handleAction('foo.foo', this.handleFooFoo);
        }
        handleFooFoo() {}
    }

    t.throws(() => new Dispatcher({ stores: { foo: FooStore } }), /Action foo.foo does not exist. Attempted to register action handler in FooStore./, 
        'should throw error');

    t.end();
});

test('Store: handleAction handler is undefined', (t) => {
    class FooStore extends Store {
        constructor() {
            super();
            this.handleAction('foo.foo', this.notimplemented);
        }
    }

    t.throws(() => new FooStore(), /Handler for action foo.foo is not a function. Attempted to register action handler in FooStore./, 
        'should throw error');

    t.end();
});

test('Store: handleAction handler already registered', (t) => {
    class FooStore extends Store {
        constructor() {
            super();
            this.handleAction('foo.foo', this.handleFooFoo);
            this.handleAction('foo.foo', this.handleFooFoo2);
        }
        handleFooFoo() {}
        handleFooFoo2() {}
    }

    t.throws(() => new FooStore(), /Handler for action foo.foo is already registered. Attempted to register action handler in FooStore./, 
        'should throw error');

    t.end();
});

test('Store: initialState', (t) => {

    class ExtendedStore extends Store {
        getInitialState() {
            return {
                foo: 'bar'
            };
        }
    }
        
    let store = new ExtendedStore();
   
    t.deepEqual(store.getState(), { foo: 'bar' }, 
        'should set state');

    t.end();
});

test('Store: setState()', (t) => {
    let emitted = false;
    
    let store = new Store();
    store.addListener('change', () => { emitted = true; });

    store.setState({baz: 'baz'});

    t.deepEqual(store.getState(), {baz: 'baz'}, 
        'should set state');

    t.ok(emitted, 
        'should emit change event');

    t.end();
});

test('Store: setState() silent', (t) => {
    let emitted = false;
    
    let store = new Store();
    store.addListener('change', () => { emitted = true; });

    store.setState({baz: 'baz'}, {silent: true});

    t.deepEqual(store.getState(), {baz: 'baz'}, 
        'should set state');

    t.notOk(emitted, 
        'should not emit change event');

    t.end();
});

test('Store: setState() while dispatch', (t) => {
    class FooActions extends Actions {
        foo(foo) { this.dispatch('foo', foo); }
    }

    class FooStore extends Store {
        constructor() {
            super();
            this.handleAction('foo.foo', this.handleFooFoo);
        }
        handleFooFoo(...args) {
            this.setState({ foo: 'bar' });
            this.setState({ bar: 'foo' });
        }
    }

    let flux = new Dispatcher({
        actions: { foo: FooActions },
        stores: { foo: FooStore }
    });

    let n = 0;
    flux.stores.foo.addListener('change', () => n++);

    flux.actions.foo.foo();

    console.log(flux.stores.foo.getState());

    t.equal(n, 1,
        'should emit once');

    t.deepEqual(flux.stores.foo.getState(), { foo: 'bar', bar: 'foo' },
        'should merge state');

    t.end();
});


test('Store: replaceState()', (t) => {
    class ExtendedStore extends Store {
        getInitialState() {
            return {
                foo: 'bar'
            };
        }
    }

    let s = new ExtendedStore();

    s.replaceState({ qux: 'baz' });

    t.deepEqual(s.getState(), { qux: 'baz' });

    console.log(s);

    t.end();
});