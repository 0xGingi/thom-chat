import { db, generateId } from '../index';
import {
    modelPerformanceStats,
    messages,
    messageRatings,
    messageInteractions,
    type ModelPerformanceStats,
} from '../schema';
import { eq, and, count, sql } from 'drizzle-orm';

export async function getModelPerformanceStatsByUser(
    userId: string
): Promise<ModelPerformanceStats[]> {
    const results = await db.query.modelPerformanceStats.findMany({
        where: eq(modelPerformanceStats.userId, userId),
    });
    return results;
}

export async function getModelPerformanceStats(
    userId: string,
    modelId: string,
    provider: string
): Promise<ModelPerformanceStats | null> {
    const result = await db.query.modelPerformanceStats.findFirst({
        where: and(
            eq(modelPerformanceStats.userId, userId),
            eq(modelPerformanceStats.modelId, modelId),
            eq(modelPerformanceStats.provider, provider)
        ),
    });
    return result ?? null;
}

export async function upsertModelPerformanceStats(
    data: {
        userId: string;
        modelId: string;
        provider: string;
        totalMessages: number;
        avgRating?: number;
        thumbsUpCount: number;
        thumbsDownCount: number;
        regenerateCount: number;
        avgResponseTime?: number;
        avgTokens?: number;
        totalCost: number;
        errorCount: number;
        accurateCount: number;
        helpfulCount: number;
        creativeCount: number;
        fastCount: number;
        costEffectiveCount: number;
    }
): Promise<ModelPerformanceStats> {
    const existing = await getModelPerformanceStats(data.userId, data.modelId, data.provider);

    if (existing) {
        const [result] = await db
            .update(modelPerformanceStats)
            .set({
                ...data,
                lastUpdated: new Date(),
            })
            .where(eq(modelPerformanceStats.id, existing.id))
            .returning();
        return result!;
    }

    const [result] = await db
        .insert(modelPerformanceStats)
        .values({
            id: generateId(),
            ...data,
            lastUpdated: new Date(),
        })
        .returning();

    return result!;
}

// Calculate and update performance stats for a specific model
export async function calculateModelPerformanceStats(
    userId: string,
    modelId: string,
    provider: string
): Promise<ModelPerformanceStats> {
    try {
        console.log(`[model-performance] Calculating stats for ${modelId} (${provider})`);

        // Get all messages for this model
        const modelMessages = await db.query.messages.findMany({
            where: and(
                eq(messages.modelId, modelId),
                eq(messages.provider, provider),
                sql`${messages.conversationId} IN (SELECT id FROM ${sql.identifier('conversations')} WHERE ${sql.identifier('user_id')} = ${userId})`
            ),
            with: {
                ratings: true,
                interactions: true,
            },
        });

        // Calculate stats
        const totalMessages = modelMessages.length;
        const totalCost = modelMessages.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
        const errorCount = modelMessages.filter((m) => m.error).length;

        // Only consider assistant messages with token/latency data for speed-related metrics
        const responseMessages = modelMessages.filter(
            (m) => m.role === 'assistant' && m.tokenCount !== null && m.tokenCount !== undefined
        );
        const responsesWithLatency = responseMessages.filter(
            (m) => m.responseTimeMs !== null && m.responseTimeMs !== undefined && m.responseTimeMs > 0
        );

        const avgTokens =
            responseMessages.length > 0
                ? responseMessages.reduce((sum, m) => sum + (m.tokenCount ?? 0), 0) /
                  responseMessages.length
                : 0;

        const avgResponseTime =
            responsesWithLatency.length > 0
                ? responsesWithLatency.reduce((sum, m) => sum + (m.responseTimeMs ?? 0), 0) /
                  responsesWithLatency.length
                : undefined;

        // Calculate rating stats
        const allRatings = modelMessages.flatMap((m) => m.ratings ?? []);
        const ratingsWithNumbers = allRatings.filter((r) => r.rating !== null);
        const avgRating =
            ratingsWithNumbers.length > 0
                ? ratingsWithNumbers.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
                ratingsWithNumbers.length
                : undefined;

        const thumbsUpCount = allRatings.filter((r) => r.thumbs === 'up').length;
        const thumbsDownCount = allRatings.filter((r) => r.thumbs === 'down').length;

        // Calculate interaction stats
        const allInteractions = modelMessages.flatMap((m) => m.interactions ?? []);
        const regenerateCount = allInteractions.filter((i) => i.action === 'regenerate').length;

        // Calculate category counts
        const categoryMap = {
            Accurate: 0,
            Helpful: 0,
            Creative: 0,
            Fast: 0,
            'Cost-effective': 0,
        };

        for (const rating of allRatings) {
            if (rating.categories && Array.isArray(rating.categories)) {
                for (const category of rating.categories) {
                    if (category in categoryMap) {
                        categoryMap[category as keyof typeof categoryMap]++;
                    }
                }
            }
        }

        // Upsert the stats
        const result = await upsertModelPerformanceStats({
            userId,
            modelId,
            provider,
            totalMessages,
            avgRating,
            thumbsUpCount,
            thumbsDownCount,
            regenerateCount,
            avgResponseTime,
            avgTokens: avgTokens > 0 ? avgTokens : undefined,
            totalCost,
            errorCount,
            accurateCount: categoryMap.Accurate,
            helpfulCount: categoryMap.Helpful,
            creativeCount: categoryMap.Creative,
            fastCount: categoryMap.Fast,
            costEffectiveCount: categoryMap['Cost-effective'],
        });

        console.log(`[model-performance] Stats calculated: ${totalMessages} messages rating: ${avgRating?.toFixed(2) ?? 'N/A'}`);
        return result;
    } catch (err) {
        console.error(`[model-performance] Error calculating stats for ${modelId}:`, err);
        throw err;
    }
}

// Calculate stats for all models used by a user
export async function calculateAllModelPerformanceStats(
    userId: string
): Promise<ModelPerformanceStats[]> {
    try {
        console.log(`[model-performance] Calculating all stats for user ${userId}`);

        // Get distinct model/provider combinations for this user
        const distinctModels = await db
            .selectDistinct({
                modelId: messages.modelId,
                provider: messages.provider,
            })
            .from(messages)
            .innerJoin(
                sql`conversations`,
                sql`${messages.conversationId} = conversations.id AND conversations.user_id = ${userId}`
            )
            .where(and(sql`${messages.modelId} IS NOT NULL`, sql`${messages.provider} IS NOT NULL`));

        console.log(`[model-performance] Found ${distinctModels.length} distinct models for user ${userId}`);

        // Calculate stats for each model
        const results: ModelPerformanceStats[] = [];
        for (const model of distinctModels) {
            if (model.modelId && model.provider) {
                try {
                    const stats = await calculateModelPerformanceStats(
                        userId,
                        model.modelId,
                        model.provider
                    );
                    results.push(stats);
                } catch (err) {
                    console.error(`[model-performance] Failed to calculate stats for ${model.modelId}:`, err);
                    // Continue with other models even if one fails
                }
            }
        }

        console.log(`[model-performance] Successfully calculated stats for ${results.length} models`);
        return results;
    } catch (err) {
        console.error(`[model-performance] Error calculating all stats for user ${userId}:`, err);
        throw err;
    }
}

export async function deleteModelPerformanceStats(statsId: string): Promise<void> {
    await db.delete(modelPerformanceStats).where(eq(modelPerformanceStats.id, statsId));
}
