/**
 * 队列接受 (() => Promise<T>)[] 形式的数据
 */
type PromiseFunction<T> = () => Promise<T>;

class ConcurrencyPromisePool<T> {
    limit: number;
    runningNum: number;
    queue: PromiseFunction<T>[];
    results: T[];
    constructor(limit: number) {
        // *限制
        this.limit = limit;
        // *正在执行的请求数
        this.runningNum = 0;
        // *队列
        this.queue = [];
        // *最终结果
        this.results = [];
    }

    all(promises: PromiseFunction<T>[]): Promise<T[]> {
        return new Promise((resolve, reject) => {
            for (const promise of promises) {
                this._run(promise, resolve, reject);
            }
        });
    }

    _run(promise: PromiseFunction<T>, resolve: Function, reject: Function): void {
        // 如果请求数大于限制数，就加入 queue 队列
        if (this.runningNum >= this.limit) {
            console.log('>>> 达到上限，入队！');
            this.queue.push(promise);
            return;
        }
        // 自加
        ++this.runningNum;
        promise()
            .then(res => {
                this.results.push(res);
                --this.runningNum;
                // 当队列为 0 并且执行的任务也为 0 时，说明都完成了
                if (this.queue.length === 0 && this.runningNum === 0) {
                    return resolve(this.results);
                }
                // 当队列中还有新的任务，则递归继续 _run
                if (this.queue.length) {
                    this._run(this.queue.shift()!, resolve, reject);
                }
            })
            .catch((e) => reject(e));
    }
}

export default ConcurrencyPromisePool;
