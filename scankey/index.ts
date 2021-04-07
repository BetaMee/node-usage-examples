import { promises as fsPromise } from 'fs';
import { Stats } from 'node:fs';
import ConcurrencyPromisePool from './utils/ConcurrencyPromisePool';
import * as path from 'path';
import {
    filter,
    split,
    includes,
    map,
    prop,
    test,
    pipe,
    andThen,
    length,
    ifElse,
    keys,
    always,
    isEmpty,
    allPass,
    takeLast,
    join,
    dropLast,
    uniq,
    flatten
} from 'ramda';

// *helper function
const exclude = [
    '.DS_Store',
    'README.md',
    'build',
    'coverage',
    'dist',
    'docs',
    'node_modules',
    'package-lock.json',
    'package.json',
    'scripts',
    'test',
    'tsconfig.json',
    'typings'
];
const suffixExtension = [
    'suffix.formatA',
    'suffix.formatB',
    'suffix.formatC'
];
// *提取格式化的文本: 'a.b.c' => 'a'
const extract = (f: string, n: number, s: string) => join('.')(dropLast(n)(split(s)(f)));
// *提取格式化的文本 extract 的反向操作: 'a.b.c' => 'b.c'
const extractLast = (f: string, n: number, s: string) => join('.')(takeLast(n)(split(s)(f)));
const extractExtension = (f: string) => extractLast(f, 1, '.');
const isNotInclude = (f: string) => !includes(f)(exclude);
const isNotCSS = (f: string) => !includes(extractExtension(f))(['css', 'scss', 'less']);
const isNotFont = (f: string) => !includes(extractExtension(f))(['otf', 'ttf', 'woff', 'woff2']);
const isNotImage = (f: string) => !includes(extractExtension(f))(['png', 'jpeg', 'svg']);
const isNotEmptyStr = (k: string) => !isEmpty(k);
const isJSorTSFile = (f: string) => includes(extractExtension(f))(['js', 'jsx', 'ts', 'tsx']);
const joinPath = (p: string) => (f: string) => path.join(p, f);
const resolvePath = (f: string) => path.resolve(__dirname, f);
const filterDirs = (d: string[]) => filter(allPass([
    isNotInclude,
    isNotCSS,
    isNotFont,
    isNotImage
]))(d);
const filterResult = (r: string[]) => filter(
    allPass([isNotEmptyStr])
)(r);
// *读取文件夹
const readDir = (f: string) => fsPromise.readdir(f);
// *读取文件状态
const readFileStat = (f: string) => fsPromise.stat(f);
// *读取文件内容
const readFileContent = (f: string) => fsPromise.readFile(f, 'utf-8');
// *写入文档
const writeFile = (d: any, f: string) => fsPromise.writeFile(f, d, 'utf-8');
// *处理 JSON 数据
const parseJSON = (d: string) => JSON.parse(d);
const stringifyJSON = (d: string[], replacer = null, space = 2) => JSON.stringify({ data: d }, replacer, space);
// *提取对象的 key
const extractKeys = (o: Object) => keys(o);

/**
 * *开启一个控制并发器
 * @param {Function<Promise<T>>[]} p 需要处理的并发控制列表，格式必须是 (() => Promise<T>)[]，只要用到时才会执行内部函数
 * @param {Number} limit 并发限制数
 * @return {Promise} 并发控制器
 */
const startAConcurrencyPool = <T>(p: (() => Promise<T>)[], limit = 10) => {
    const pool = new ConcurrencyPromisePool<T>(limit);
    return pool.all(p);
};

/**
 * *获取解析的  Keys
 * @param {String} f 文件路径名
 * @return {Promise} Promise<string[]>
 */
const getParsedContent = (f: string) => () => pipe(
    resolvePath,
    readFileContent,
    andThen(parseJSON),
    andThen(extractKeys)
)(f);

/**
 * *生成一个匹配 key 的正则
 * @param {String} k key
 * @return {RegExp}
 */
const formatKeyReg = (k: string) => new RegExp(k, 'g');

/**
 * *正则匹配文件内容，返回 boolean
 * @param {String} k  key
 * @return {Function} (c: string) => boolean
 */
const testFileContent = (k: string) => (c: string) => test(formatKeyReg(k), c);

/**
 * *判断一个 key 是否在 file 中，返回一个通过 pipe 封装的 Promise<boolean>
 * @param {String} k  key
 * @return {Function} (f: string) => () => Promise<boolean>
 */
const isKeyInFile = (k: string) => (f:string) => () => pipe(
    resolvePath, // 解析文件路径
    readFileContent, // 到这一步已经拿到文件 content
    andThen(testFileContent(k)) // 测试当前的 key 是否在 content 中
)(f);

/**
 * *提取主 key
 * *提取 key 的特殊情况：有些 key 有多种变换形式，比如 f.suffix.formatA 和 f.suffix.formatB 但都属于一个 key 类。
 * @param {String} k key
 * @return {String}
 */
const extractKeyMode = (k: string) => ifElse(
    (k: string) => includes(extractLast(k, 2, '.'))(suffixExtension),
    always(extract(k, 2, '.')),
    always(k)
)(k);

/**
 * *开启搜寻 Key 流程
 * @param {String[]} fl 文件路径列表
 * @return {Function} (k: string) => () => (() => Promise<boolean>)[]
 */
const mapKeySearchPipeProcess = (fl: string[]) => (k: string) => () => map(isKeyInFile(
    extractKeyMode(k)
))(fl);

/**
 * *过滤获取的 key 结果
 * *当结果 (r: boolean[]) 中都为 false，说明整个文件中没有匹配这个 key，则需要返回相应的 key，否则 返回 ''
 * @param {String} k  key
 * @return {Function} (r: boolean[]) => string
 */
const filterKeySearchResult = (k: string) => ifElse(
    (r: boolean[]) => length(filter((i: boolean) => i)(r)) === 0,
    always(k),
    always('')
);

/**
 * *在 fileLists 中扫描单个 Key
 * @param {String[]} fl 文件路径列表
 * @return {Function} (k: string) => () => Promise<string>
 */
const scanKeyInFileList = (fl: string[]) => (k: string) => () => pipe(
    mapKeySearchPipeProcess(fl)(k),
    startAConcurrencyPool,
    andThen<boolean[], string>(
        filterKeySearchResult(k)
    )
)();

/**
 * *在 fileLists 中扫描  Keys
 * @param {String[]} ks  Keys
 * @return {Function} (fl: string[]) => (() => Promise<string>)[]
 */
const scanKeysInFileList = (ks: string[]) => (fl: string[]) => map(scanKeyInFileList(fl))(ks);

/**
 * *包装 fs.stat，因为 fs.stat 不返回文件路径信息
 * @param {String} f 文件路径名
 * @return {Object} { stat: Stats; path: string }
 */
const warpStatWithPath = (f: string) => (stat: Stats) => ({ stat, path: f });

/**
 * *获取文件 stat 信息
 * @param {String} f 文件路径名
 * @return {Promise} Promise<{ stat: Stats; path: string }>
 */
const getFileDirStat = (f: string) => pipe(
    readFileStat,
    andThen(warpStatWithPath(f))
)(f);

/**
 * *读取 rootPath 下所有的文件地址
 * @param {String} rootPath 文件夹入口
 * @return {Promise<String[]>} 返回这个文件夹下的所有文件列表
 */
const extractAllFilePath = async(rootPath: string) => {
    const filePathList: string[] = [];
    // *异步递归树形结构的文件夹：使用 for-await-of 遍历
    const recursiveFilePath = async(rootPath: string) => {
        const dirs = await readDir(rootPath);
        const fileDirPathArr = map(joinPath(rootPath))(filterDirs(dirs));
        const fileDirStatArr = map(getFileDirStat)(fileDirPathArr);

        for await (const fileDirStat of fileDirStatArr) {
            const stat = prop('stat')(fileDirStat);
            const path = prop('path')(fileDirStat);

            if (isJSorTSFile(path) && stat.isFile()) {
                filePathList.push(path);
            }
            if (stat.isDirectory()) {
                await recursiveFilePath(path);
            }
        }
    };
    await recursiveFilePath(rootPath);
    return filePathList;
};

/**
 * *获取所有的 key 资源
 * @param {String} resourcePath key 资源文件夹
 * @return {Promise<string[]>} 所有的资源
 */
const extractAllKeys = async(resourcePath: string) => pipe(
    readDir,
    andThen(filterDirs),
    andThen(map(joinPath(resourcePath))),
    andThen(map(getParsedContent)),
    andThen(startAConcurrencyPool),
    andThen(flatten),
    andThen(uniq)
)(resourcePath);

// *开始程序
// 在命令行中 run: ./node_modules/.bin/ts-node ./scankey/index.ts
// *需求解读
// 这个程序，主要目的是为了扫描项目文件中用到的 key。
// 页面的文本是多语言 key 动态获取的，而非 hard code。如 page_book_detail_tip，它会在每一个站点动态地获取对应的文本。
// 现在一个页面中有很多 key，这些 key 经过几年的迭代，很多不用了，需要扫描整理出来。
// *如何开始？
// 程序要做的事很简单：先获取 key 列表，然后每一个 key 都循环匹配每一个文件内容
// 如果这个 key 不存在，则返回这个 key，最终不存在的这些 key 形成一个数组，放在 JSON 中。
// 这就是整个程序要做的。
// *这个项目可以学到：
// + 函数式编程的思考
// + TS 工程的类型注解
// + Node File API 的使用
// + 异步循环处理两层or多层结构
// + 如何处理大量异步并发任务
// *程序流程
// 1. 读取要扫描的所有文件列表 file list: fileList: string[]
// 2. 读取文件中的 key list: sourceKeys: string[]
// 3. 对每一个 key，生成一个搜索程序：(k: string) => Promise<string>
//    + 入参：key
//    + 出参：如果没有搜索到，则返回这个 key，如果搜索到了，则返回 ''
// 4. 最终形成一个搜索程序列表 ((k: string) => Promise<string>)[]，交给 ConcurrencyPromisePool，有限制地并发执行
// 5. 针对每一个搜索程序，也是一个由下一层的搜索得来的
// 6. 对 fileList 进行 map 操作，生成：((k: string, f: string) => Promise<boolean>)[]
// 7. 使用 ConcurrencyPromisePool 调用后返回 boolean[]
// 8. 如果都为 false，则说明 key 不在这个仓库里
// 9. 再往上返回结果，交给第三步
async function startScanKeys() {
    // 执行
    try {
        // 开始扫描的路径
        const searchPath = resolvePath('./test/repo/');
        // 源 keys 资源
        const sourceKeysPath = resolvePath('./test/source/');
        // 输出结果
        const outputResultPath = resolvePath('./test/output/unUsedKeys.json');
        // 读取所有文件的地址
        const fileList: string[] = await extractAllFilePath(searchPath);
        // 读取源 keys 内容
        const sourceKeys: string[] = await extractAllKeys(sourceKeysPath);
        // 生成处理函数
        const scanProcessList: (() => Promise<string>)[] = scanKeysInFileList(sourceKeys)(fileList);
        // 开启并发流
        const result:string[] = await startAConcurrencyPool(scanProcessList);
        // 写入结果
        await writeFile(
            stringifyJSON(filterResult(result)),
            outputResultPath
        );
    } catch (e) {
        console.error(e);
    }
}

startScanKeys();
