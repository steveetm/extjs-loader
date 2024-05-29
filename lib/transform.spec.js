

function getFunctionBodySource(fn) {
    return fn.toString().slice(fn.toString().indexOf('{') + 1, fn.toString().lastIndexOf('}'));
}

const pathMapping = {
    Test: 'Test/',
    Ext: 'Ext/',
}
const transform = require('./transform');

function transpileFunction(fn) {
    return transform(getFunctionBodySource(fn), undefined, pathMapping);
}
describe('transform', () => {
    it('should transform ExtJS requires to require()s', () => {
        function ExtClassInput() {
            Ext.define('Ext.My.Class', {
                requires:['Test.Path.Of.The.Module'],
            });
        }

        const [output] = transpileFunction(ExtClassInput);
        expect(output).toMatchInlineSnapshot(`
"require("Test//Path/Of/The/Module.js");
Ext.define('Ext.My.Class', {});"
`);
    });

    it('should not transform requires if not directly in Ext.define()', () => {
        function ExtClassInput() {
            Ext.define('Ext.My.Class', {
                requires:['Test.Path.Of.The.Module'],
                memberFunction() {
                    const shouldNotConvertedToRequire = {
                        requires: ['Test.Path.Of.The.Module'],
                    }
                }
            });
        }

        const [output] = transpileFunction(ExtClassInput);
        expect(output).toMatchInlineSnapshot(`
"require("Test//Path/Of/The/Module.js");
Ext.define('Ext.My.Class', {
  memberFunction() {
    const shouldNotConvertedToRequire = {
      requires: ['Test.Path.Of.The.Module']
    };
  }
});"
`);
    });

    it('should transform requires in special Ext use-case', () => {
        function ExtClassInput() {
            Ext.define('Ext.dom.Element', function(Element) {
                return {
                   requires: ['Ext.dom.Fly']
                }
            });
        }

        const [output] = transpileFunction(ExtClassInput);
        expect(output).toMatchInlineSnapshot(`
"require("Ext//dom/Fly.js");
Ext.define('Ext.dom.Element', function (Element) {
  return {};
});"
`);
    });

    it('should transform Ext.application() definitions', () => {
        function ExtClassInput() {
            Ext.application({
                name: 'FieldServices',

                extend: 'Test.Application',

                requires: ['Ext.Class']
            });
        }

        const [output] = transpileFunction(ExtClassInput);
        expect(output).toMatchInlineSnapshot(`
"require("Ext//Class.js");
require("Test//Application.js");
Ext.application({
  name: 'FieldServices',
  extend: 'Test.Application'
});"
`);
    });

    it('should transform when decorators used on class', () => {
        function ExtClassInput() {
            Ext.define('FieldServices.view.registration.SignupController', (_dec = (0, _decorators.guardCall)(handleClientError), _dec2 = (0, _decorators.guardCall)(ifInstanceOf(_error.ServerError, function () {
                this.onRegisterError();
            })), (_obj = {
                extend: 'Test.mvc.ViewController',
                mixins: ['Test.mixins.PartnerDetails'],
                inject: ['apiService', 'loginService'],
            }, (_applyDecoratedDescriptor(_obj, "onRegisterWithXeroButtonTap", [_dec, _dec2], Object.getOwnPropertyDescriptor(_obj, "onRegisterWithXeroButtonTap"), _obj)), _obj)));

        }

        const [output] = transpileFunction(ExtClassInput);
        expect(output).toMatchInlineSnapshot(`
"require("Test//mixins/PartnerDetails.js");
require("Test//mvc/ViewController.js");
Ext.define('FieldServices.view.registration.SignupController', (_dec = (0, _decorators.guardCall)(handleClientError), _dec2 = (0, _decorators.guardCall)(ifInstanceOf(_error.ServerError, function () {
  this.onRegisterError();
})), (_obj = {
  extend: 'Test.mvc.ViewController',
  mixins: ['Test.mixins.PartnerDetails'],
  inject: ['apiService', 'loginService']
}, _applyDecoratedDescriptor(_obj, "onRegisterWithXeroButtonTap", [_dec, _dec2], Object.getOwnPropertyDescriptor(_obj, "onRegisterWithXeroButtonTap"), _obj), _obj)));"
`);
    });

    it('should transform when decorators used on class - second case', () => {
        function ExtClassInput() {
            Ext.define('FieldServices.singletons.PurchaseManager', (_obj = {
                extend: 'Test.Base',
                requires: ['Test.view.SubscribeWindow'],

            }, (_applyDecoratedDescriptor(_obj, "hasBeeProduct", [memoizeRunningPromise], Object.getOwnPropertyDescriptor(_obj, "hasBeeProduct"), _obj), _applyDecoratedDescriptor(_obj, "registerProducts", [memoizeRunningPromise], Object.getOwnPropertyDescriptor(_obj, "registerProducts"), _obj)), _obj));

        }

        const [output] = transpileFunction(ExtClassInput);
        expect(output).toMatchInlineSnapshot(`
"require("Test//view/SubscribeWindow.js");
require("Test//Base.js");
Ext.define('FieldServices.singletons.PurchaseManager', (_obj = {
  extend: 'Test.Base'
}, (_applyDecoratedDescriptor(_obj, "hasBeeProduct", [memoizeRunningPromise], Object.getOwnPropertyDescriptor(_obj, "hasBeeProduct"), _obj), _applyDecoratedDescriptor(_obj, "registerProducts", [memoizeRunningPromise], Object.getOwnPropertyDescriptor(_obj, "registerProducts"), _obj)), _obj));"
`);
    });
});