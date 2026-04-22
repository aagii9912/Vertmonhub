
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Mocking the Supabase-like deletion behavior with network latency
const LATENCY_MS = 100; // Simulating 100ms network latency per request

async function mockIndividualDeletions(userIds: string[]) {
    console.log(`🚀 Starting individual deletions for ${userIds.length} users...`);
    const start = Date.now();

    for (const id of userIds) {
        // Simulate a database call
        await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
        // console.log(`   Deleted shop for user ${id}`);
    }

    const end = Date.now();
    return end - start;
}

async function mockBulkDeletion(userIds: string[]) {
    console.log(`🚀 Starting bulk deletion for ${userIds.length} users...`);
    const start = Date.now();

    // Simulate a single database call for all IDs
    await new Promise(resolve => setTimeout(resolve, LATENCY_MS));
    // console.log(`   Deleted shops for ${userIds.length} users in one go`);

    const end = Date.now();
    return end - start;
}

async function runBenchmark() {
    const userCount = 50;
    const userIds = Array.from({ length: userCount }, (_, i) => `user-uuid-${i}`);

    console.log(`--- Performance Benchmark (Simulated ${LATENCY_MS}ms Latency) ---`);
    console.log(`Users to process: ${userCount}\n`);

    const individualTime = await mockIndividualDeletions(userIds);
    console.log(`⏱️  Individual Deletions Total Time: ${individualTime}ms`);

    const bulkTime = await mockBulkDeletion(userIds);
    console.log(`⏱️  Bulk Deletion Total Time: ${bulkTime}ms`);

    const improvement = ((individualTime - bulkTime) / individualTime * 100).toFixed(2);
    console.log(`\n📈 Improvement: ${improvement}% faster`);
    console.log(`💰 Time saved: ${individualTime - bulkTime}ms`);
}

runBenchmark().catch(console.error);
