// Limit concurrent model downloads without changing world placement order.
export async function runLoadQueue(items, load, concurrency = 4) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
    const unique = [...new Set(items)];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
        while (next < unique.length) {
            const item = unique[next++];
            await load(item);
        }
    }));
}
