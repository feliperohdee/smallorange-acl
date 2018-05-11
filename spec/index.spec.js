const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

const _ = require('lodash');
const {
    Observable
} = require('rxjs');

const Model = require('../testing/Model');
const Acl = require('../');

const expect = chai.expect;

chai.use(sinonChai);

describe('index.js', () => {
    let acl;
    let model;
    let args;
    let auth;

    beforeEach(() => {
        model = new Model();
        acl = new Acl({}, {
            model
        });

        acl.acls = _.clone({
			fetch: {
				someRole: true
			}
        }, true);

        args = {
            id: 'someId'
        };

        auth = _.clone({
            namespace: 'someNamespace',
            role: 'someRole',
            id: 'someId'
        }, true);
    });

    describe('constructor', () => {
        it('should create executors', () => {
			acl = new Acl(acl.acls);

            expect(_.size(acl.execute)).to.equal(1);
            expect(acl.execute.fetch).to.be.a('function');
        });

        it('should not create executors', () => {
            acl = new Acl(acl.acls, {}, false);

            expect(_.size(acl.execute)).to.equal(0);
		});
		
		it('should create custom executors', () => {
			acl.acls.l0 = {
                l1: acl.acls
			};
			
			acl = new Acl(acl.acls, {}, [
				'l0.l1.fetch',
				'inexistent'
			]);

			expect(_.size(acl.execute)).to.equal(1);
			expect(acl.execute.l0.l1.fetch).to.be.a('function');
        });
    });

    describe('resolveRole', () => {
        it('should resolve get single role', () => {
            const role = acl.resolveRole(acl.acls.fetch, 'someRole');

            expect(role).to.be.true;
        });

        it('should return undefined if single role doesn\'t exists', () => {
            const role = acl.resolveRole(acl.acls.fetch, 'inexistentRole');

            expect(role).to.be.undefined;
        });

        it('should resolve get first valid role', () => {
            const role = acl.resolveRole(acl.acls.fetch, ['inexistentRole', 'someRole']);

            expect(role).to.be.true;
        });

        it('should return undefined if all roles doesn\'t exists', () => {
            const role = acl.resolveRole(acl.acls.fetch, ['inexistentRole', 'inexistentRole2']);

            expect(role).to.be.undefined;
        });
    });

    describe('factory', () => {
        beforeEach(() => {
            sinon.stub(acl, 'handle')
                .returns(Observable.of(true));
        });

        afterEach(() => {
            acl.handle.restore();
        });

        it('should call handle with single level', done => {
            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .subscribe(() => {
                    expect(acl.handle).to.have.been.calledWith('boolean', true, args, auth);
                }, null, done);
        });

        it('should call handle with 2 levels', done => {
            acl.acls.l0 = acl.acls;

            const fetch = acl.factory('l0.fetch');

            fetch(args, auth)
                .subscribe(() => {
                    expect(acl.handle).to.have.been.calledWith('boolean', true, args, auth);
                }, null, done);
        });

        it('should call handle with 3 levels or more', done => {
            acl.acls.l0 = {
                l1: acl.acls
            };

            const fetch = acl.factory('l0.l1.fetch');

            fetch(args, auth)
                .subscribe(() => {
                    expect(acl.handle).to.have.been.calledWith('boolean', true, args, auth);
                }, null, done);
        });

        describe('no ACL context, no ACL role, wrong ACL', () => {
            it('should return error if no ACL context', done => {
                const fetch = acl.factory('inexistent.context');

                fetch(args, auth)
                    .subscribe(null, err => {
                        expect(err.message).to.equal('There are no ACL\'s for inexistent.context');
                        done();
                    });
            });

            it('should return error if no auth', done => {
                const fetch = acl.factory('fetch');

                auth = null;

                fetch(args, auth)
                    .subscribe(null, err => {
                        expect(err.message).to.equal('No auth object provided');
                        done();
                    });
            });

            it('should return error if no ACL role', done => {
                const fetch = acl.factory('fetch');

                auth.role = 'forbiddenRole';

                fetch(args, auth)
                    .subscribe(null, err => {
                        expect(err.message).to.equal('There are no ACL\'s role for fetch');
                        done();
                    });
            });
        });
    });

    describe('handle', () => {
        beforeEach(() => {
            sinon.stub(acl, 'boolean')
                .returns(Observable.of(true));
            sinon.stub(acl, 'expression')
                .returns(Observable.of(true));
        });

        afterEach(() => {
            acl.boolean.restore();
            acl.expression.restore();
        });

        it('should block if inexistent acl type', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        __expression: args => args.id = 'enforcedId'
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth, {
                    onReject: () => new Error('customError')
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('Inexistent ACL');
                    done();
                });
        });

        it('should call boolean with empty object', done => {
            const fetch = acl.factory('fetch');

            Observable.forkJoin(
                    fetch(null, auth),
                    fetch(undefined, auth)
                )
                .subscribe(() => {
                    expect(acl.boolean).to.have.been.calledWith(true, null, auth);
                    expect(acl.boolean).to.have.been.calledWith(true, undefined, auth);
                }, null, done);
        });

        it('should call boolean', done => {
            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .subscribe(() => {
                    expect(acl.boolean).to.have.been.calledWith(true, args, auth);
                }, null, done);
        });

        it('should call expression', done => {
            const expression = () => true;

            acl.acls = {
                fetch: {
                    someRole: {
                        expression
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .subscribe(() => {
                    expect(acl.expression).to.have.been.calledWith(expression, args, auth);
                }, null, done);
        });

        it('should handle exception', done => {
            acl.boolean.restore();

            sinon.stub(acl, 'boolean')
                .throws(new Error('ops...'));

            const fetch = acl.factory('fetch');

            fetch(args, auth, {
                    onReject: () => new Error('customError')
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('Bad ACL: ops...');
                    done();
                });
        });
    });

    describe('boolean', () => {
        it('should block if args = false', done => {
            const fetch = acl.factory('fetch');

            fetch(false, auth)
                .subscribe(null, err => {
                    expect(err.message).to.equal('ACL refused request');
                    done();
                });
        });

        it('should grant if args = null', done => {
            const fetch = acl.factory('fetch');

            fetch(null, auth)
                .subscribe(response => {
                    expect(response).to.be.null;
                }, null, done);
        });

        it('should block if role = false', done => {
            acl.acls = {
                fetch: {
                    someRole: false
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .subscribe(null, err => {
                    expect(err.message).to.equal('ACL refused request');
                    done();
                });
        });

        it('should block if role = null', done => {
            acl.acls = {
                fetch: {
                    someRole: null
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .subscribe(null, err => {
                    expect(err.message).to.equal('ACL refused request');
                    done();
                });
        });

        it('should block with custom error', done => {
            acl.acls = {
                fetch: {
                    someRole: null
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth, {
                    onReject: () => new Error('customError')
                })
                .subscribe(null, err => {
                    expect(err.message).to.equal('customError');
                    done();
                });
        });

        it('should block silently', done => {
            acl.acls = {
                fetch: {
                    someRole: null
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth, {
                    rejectSilently: true
                })
                .subscribe(null, null, done);
        });


        it('should grant if true', done => {
            acl.acls = {
                fetch: {
                    someRole: true
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(args);
                }, null, done);
        });
    });

    describe('expression', () => {
        it('should pass args, auth and context', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: (args, auth, context) => !!(args && auth && context.model instanceof Model)
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(args);
                }, null, done);
        });

        it('should handle implicit expression', done => {
            acl.acls = {
                fetch: {
                    someRole: (args, auth, context) => !!(args && auth && context.model instanceof Model)
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(args);
                }, null, done);
        });

        it('should handle expression exception', done => {
            acl.acls = {
                fetch: {
                    someRole: (args, auth, model) => {
                        throw new Error('error');
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(null, err => {
                    expect(err.message).to.equal('Bad ACL: error');
                    done();
                });
        });

        it('should feed args', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: () => ({
                            replaced: 'replaced'
                        })
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .do(args => {
                    expect(args.replaced).to.equal('replaced');
                })
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith({
                        replaced: 'replaced'
                    });
                }, null, done);
        });

        it('should block if condition not satisfied', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: args => args.id === auth.id
                    }
                }
            }

            auth.id = 'wrongId';

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .subscribe(null, err => {
                    expect(err.message).to.equal('ACL refused request');
                    done();
                });
        });

        it('should grant if condition satisfied', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: args => args.id === auth.id
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(args);
                }, null, done);
        });

        it('should grant if condition = null', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: () => null
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(null);
                }, null, done);
        });

        it('should block with custom error if returns an error', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: args => new Error('Unknown error')
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .subscribe(null, err => {
                    expect(err.message).to.equal('Unknown error');
                    done();
                });
        });

        it('should handle observable throwing', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: args => Observable.throw(new Error('Observable throw'))
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .subscribe(null, err => {
                    expect(err.message).to.equal('Observable throw');
                    done();
                });
        });

        it('should handle observable rejecting', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: args => Observable.of(false)
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .subscribe(null, err => {
                    expect(err.message).to.equal('ACL refused request');
                    done();
                });
        });

        it('should handle observable granting', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        expression: args => Observable.of(true)
                    }
                }
            }

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(args);
                }, null, done);
        });
    });

    describe('combined', () => {
        it('should accept composed ACL\'s', done => {
            acl.acls = {
                fetch: {
                    someRole: {
                        boolean: true,
                        expression: args => ({
                            id: 'enforcedId'
                        })
                    }
                }
            };

            const fetch = acl.factory('fetch');

            fetch(args, auth)
                .do(aclArgs => {
                    expect(aclArgs.id).to.equal('enforcedId');

                    args = aclArgs;
                })
                .mergeMap(model.fetch.bind(model))
                .toArray()
                .subscribe(() => {
                    expect(Model.fetchSpy).to.have.been.calledWith(args);
                }, null, done);
        });
    });
});