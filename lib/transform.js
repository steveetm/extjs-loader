
const traverse = require("@babel/traverse").default;
const babelCore = require('@babel/core');

const types = require("@babel/types");
const chalk = require("chalk");

const nameSpace = 'FieldServices';
const configMap = {
    requires: {
        remove: true
    },
    mixins: {
        allowObject: true
    },
    override: true,
    extend: true,
    uses: {
        end: true
    },
    stores: {
        prefix: nameSpace + '.store.'
    },
    controllers: {
        prefix: nameSpace + '.controller.'
    },
    // /sViewCache\(['"](.*)['"],\s{/img,
    controller: true
};

function addRequire(pathMap, className, prefix) {
    if (className.indexOf('.') > 0 || prefix != '' || className === 'Ext') {
        var fileToRequire = resolveClassFile(pathMap, ((className.indexOf('.') > 0) ? '' : prefix) + className);

        return fileToRequire;
    }
    return '';
}

function resolveClassFile(pathMap, className) {
    let fileToLoad = className;
    let retVal = className;
    retVal = [];
    for (var prefix in pathMap) {
        if (pathMap.hasOwnProperty(prefix)) {
            let re = new RegExp('^' + prefix);
            if (className.match(re)) {
                if (pathMap[prefix] === false) {
                    retVal = [];
                } else {
                    if (typeof pathMap[prefix].query === 'function') {

                        let classes = pathMap[prefix].query(className);
                        if (classes instanceof Array) {
                            retVal = classes.map((className) => {
                                return className.src;
                            });
                        } else {
                            try {
                                if (!classes.src) {
                                    console.log(chalk.red(`Required class "${className}" not found in ${self.resourcePath}`));
                                    retVal = [];
                                } else {
                                    retVal = [classes.src];
                                }
                            } catch (e) {
                                console.log(prefix, className);
                            }
                        }
                    } else {
                        retVal = [prefix.replace(prefix, pathMap[prefix]) + className.replace(prefix, '').replace(/\./g, '/') + '.js'];
                    }
                }
                break;
            }
        }
    }
    return [...retVal].filter(Boolean);

}

let properties = Object.keys(configMap);

function findParentPath(path) {
    if (path.isExpressionStatement() || path.isProgram()) {
        return path;
    } else {
        return findParentPath(path.parentPath);
    }
}

function isCallExpressionExtDefine(node) {
    if (node.type !== 'CallExpression') {
        return false;
    }
    if (node.callee?.type !== 'MemberExpression') {
        return false;
    }
    if (node.callee?.object?.name === 'Ext' && ['define', 'override'].includes(node?.callee?.property?.name)) {
        return true;
    }
}

function isExtAppExpression(node) {
    if (node.type !== 'CallExpression') {
        return false;
    }
    if (node.callee?.type !== 'MemberExpression') {
        return false;
    }
    if (node.callee?.object?.name === 'Ext' && node?.callee?.property?.name === 'application') {
        return true;
    }
}

function isDefinedWithDecorators(path) {
    let  decoratorLike = path?.parentPath?.parentPath?.parentPath?.parentPath;
    if (decoratorLike?.type !== 'SequenceExpression') {
        decoratorLike = path?.parentPath?.parentPath?.parentPath;
        if (decoratorLike?.type !== 'SequenceExpression') {
            return false;
        }
    }
    if (decoratorLike?.parent?.callee?.type !== 'MemberExpression') {
        return false;
    }
    if (decoratorLike?.parent?.callee?.object?.name === 'Ext' && ['define', 'override'].includes(decoratorLike?.parent?.callee?.property?.name)) {
        return true;
    }
}

function isInExtDefine(path) {
    // Special case for Ext defined classes
    if (path?.parentPath?.parentPath?.type === 'ReturnStatement') {
        if (path?.parentPath?.parentPath?.parentPath?.parentPath?.type === 'FunctionExpression') {
            if (isCallExpressionExtDefine(path.parentPath?.parentPath?.parentPath?.parentPath?.parent)) {
                return true;
            }
        }
    }

    if (isCallExpressionExtDefine(path?.parentPath?.parent)) {
        return true;
    }
    if (isExtAppExpression(path?.parentPath?.parent)) {
        return true;
    }

    if (isDefinedWithDecorators(path)) {
        return true;
    }
    return false;
}
function transform(source, sourceMap, pathMap, babelConfig, topRequires = [], bottomRequires = []) {
    const {ast, map} = babelCore.transformSync(source, {
        ast: true,
        inputSourceMap: sourceMap || undefined,
        ...babelConfig,
    });

    const newRequires = Object.keys(configMap).reduce((acc, curr) => {
        acc[curr] = [];
        return acc;
    }, {});
    traverse(ast, {
        Property: function (path) {
            const node = path.node;
            if (!isInExtDefine(path)) {
                return;
            }
            if (properties.includes(node.key.name)) {
                const insertInto = findParentPath(path.parentPath);

                const nodeName = node.key.name;

                if (node.value && node.value.type === 'StringLiteral' && node.value.value !== null) {
                    newRequires[nodeName].push({
                        requires: addRequire(pathMap, node.value.value, configMap[node.key.name].prefix || ''),
                        insertInto,
                        end: configMap[nodeName].end
                    });
                }
                if (node.value && node.value.type === 'ArrayExpression') {
                    node.value.elements.forEach(function (element) {
                        newRequires[nodeName].push({
                            requires: addRequire(pathMap, element.value, configMap[node.key.name].prefix || ''),
                            insertInto,
                            end: configMap[nodeName].end
                        });
                    })
                }
                if (node.value && node.value.type === 'ObjectExpression' && node.value.properties && node.value.properties.length > 0 && configMap[node.key.name].allowObject) {
                    node.value.properties.forEach(function (objectNode) {
                        if (objectNode && objectNode.value && objectNode.value.type === 'StringLiteral') {
                            if (objectNode.value !== null) {
                                newRequires[nodeName].push({
                                    requires: addRequire(pathMap, objectNode.value.value, configMap[nodeName].prefix || ''),
                                    insertInto,
                                    end: configMap[nodeName].end
                                });
                            }
                        }
                    })
                }
                if (configMap[nodeName].remove === true) {
                    path.remove();
                }
            }
        },
    });

    Object.keys(newRequires).forEach(newRequiresKey => {
        newRequires[newRequiresKey].forEach(requiresByType => {
            const {insertInto, requires, end} = requiresByType;

            if (!requires?.map) {
                return;
            }
            const requireExpressions = requires.map((_require) => {
                return types.expressionStatement(
                    types.callExpression(types.identifier("require"), [types.stringLiteral(_require)])
                );
            });
            if (end) {
                if (insertInto.isProgram()) {
                    insertInto.pushContainer('body', requireExpressions)
                } else {
                    insertInto.insertAfter(requireExpressions);

                }
            } else {
                if (insertInto.isProgram()) {
                    insertInto.unshiftContainer('body', requireExpressions)
                } else {
                    insertInto.insertBefore(requireExpressions);
                }
            }
        })
    })
    /**
     * Some
     */
    /*try {
        content = content.replace(/Ext.safeCreate\(['"](.*)['"]/img, function (match, offset, string) {
            const resolvedClasses = resolveClassFile(offset);
            let className;
            if (resolvedClasses.length === 0) {
                throw new Error(`Couldn't resolve class: ${offset}`)
            } else {
                className = resolvedClasses[0];
            }
            return 'require(' + escodegen.generate({
                type: 'Literal',
                value: className
            }) + ');\r\n' + match;
        });

        fs.writeFileSync(cacheFile, content);
        callback(null, content, map);
    } catch (e) {
        callback(e)
    }*/
    const topRequireExpression = topRequires.map((_require) => {
        return types.expressionStatement(
            types.callExpression(types.identifier("require"), [types.stringLiteral(_require)])
        );
    });
    const bottomRequireExpressions = bottomRequires.map((_require) => {
        return types.expressionStatement(
            types.callExpression(types.identifier("require"), [types.stringLiteral(_require)])
        );
    });
    ast.program.body.unshift(...topRequireExpression);
    ast.program.body.push(...bottomRequireExpressions);
    const {code: modifiedCode, map: modifiedMap} = babelCore.transformFromAstSync(ast, null, {
        inputSourceMap: map || undefined,
        sourceMaps: true,
    });

    return [modifiedCode, modifiedMap];
}

module.exports = transform;
