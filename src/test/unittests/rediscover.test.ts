import { assert } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfigurationTarget } from 'vscode';
import { CommandSource } from '../../client/unittests/common/constants';
import { ITestManagerFactory, TestProvider } from '../../client/unittests/common/types';
import { deleteDirectory, deleteFile, rootWorkspaceUri, updateSetting } from '../common';
import { initialize, initializeTest, IS_MULTI_ROOT_TEST } from './../initialize';
import { UnitTestIocContainer } from './serviceRegistry';

const testFilesPath = path.join(__dirname, '..', '..', '..', 'src', 'test', 'pythonFiles', 'testFiles', 'debuggerTest');
const testFile = path.join(testFilesPath, 'tests', 'test_debugger_two.py');
const testFileWithFewTests = path.join(testFilesPath, 'tests', 'test_debugger_two.txt');
const testFileWithMoreTests = path.join(testFilesPath, 'tests', 'test_debugger_two.updated.txt');
const defaultUnitTestArgs = [
    '-v',
    '-s',
    '.',
    '-p',
    '*test*.py'
];

// tslint:disable-next-line:max-func-body-length
suite('Unit Tests re-discovery', () => {
    let ioc: UnitTestIocContainer;
    const configTarget = IS_MULTI_ROOT_TEST ? ConfigurationTarget.WorkspaceFolder : ConfigurationTarget.Workspace;
    suiteSetup(async () => {
        await initialize();
    });
    setup(async () => {
        await fs.copy(testFileWithFewTests, testFile, { overwrite: true });
        await deleteDirectory(path.join(testFilesPath, '.cache'));
        await resetSettings();
        await initializeTest();
        initializeDI();
    });
    teardown(async () => {
        ioc.dispose();
        await resetSettings();
        await fs.copy(testFileWithFewTests, testFile, { overwrite: true });
        await deleteFile(path.join(path.dirname(testFile), `${path.basename(testFile, '.py')}.pyc`));
    });

    async function resetSettings() {
        await updateSetting('unitTest.unittestArgs', defaultUnitTestArgs, rootWorkspaceUri, configTarget);
        await updateSetting('unitTest.nosetestArgs', [], rootWorkspaceUri, configTarget);
        await updateSetting('unitTest.pyTestArgs', [], rootWorkspaceUri, configTarget);
    }

    function initializeDI() {
        ioc = new UnitTestIocContainer();
        ioc.registerCommonTypes();
        ioc.registerProcessTypes();
        ioc.registerVariableTypes();
        ioc.registerUnitTestTypes();
    }

    async function discoverUnitTests(testProvider: TestProvider) {
        const testManager = ioc.serviceContainer.get<ITestManagerFactory>(ITestManagerFactory)(testProvider, rootWorkspaceUri, testFilesPath);
        let tests = await testManager.discoverTests(CommandSource.ui, true, true);
        assert.equal(tests.testFiles.length, 2, 'Incorrect number of test files');
        assert.equal(tests.testSuites.length, 2, 'Incorrect number of test suites');
        assert.equal(tests.testFunctions.length, 2, 'Incorrect number of test functions');
        await deleteFile(path.join(path.dirname(testFile), `${path.basename(testFile, '.py')}.pyc`));
        await fs.copy(testFileWithMoreTests, testFile, { overwrite: true });
        tests = await testManager.discoverTests(CommandSource.ui, true, true);
        assert.equal(tests.testFunctions.length, 4, 'Incorrect number of updated test functions');
    }

    test('Re-discover tests (unittest)', async () => {
        await updateSetting('unitTest.unittestArgs', ['-s=./tests', '-p=test_*.py'], rootWorkspaceUri, configTarget);
        await discoverUnitTests('unittest');
    });

    test('Re-discover tests (pytest)', async () => {
        await updateSetting('unitTest.pyTestArgs', ['-k=test_'], rootWorkspaceUri, configTarget);
        await discoverUnitTests('pytest');
    });

    test('Re-discover tests (nosetest)', async () => {
        await updateSetting('unitTest.nosetestArgs', ['-m', 'test'], rootWorkspaceUri, configTarget);
        await discoverUnitTests('nosetest');
    });
});
