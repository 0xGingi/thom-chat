import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { auth } from '$lib/auth';
import {
    getModelPerformanceStatsByUser,
    calculateAllModelPerformanceStats,
} from '$lib/db/queries/model-performance';

export const load: PageServerLoad = async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
        throw redirect(302, '/');
    }

    const userId = session.user.id;

    try {
        console.log(`[analytics] Loading analytics for user ${userId}`);

        // Always recalculate stats to ensure they're up-to-date
        const stats = await calculateAllModelPerformanceStats(userId);
        console.log(`[analytics] Calculated stats for ${stats.length} models`);

        // Calculate additional insights
        const totalMessages = stats.reduce((sum, s) => sum + s.totalMessages, 0);
        const totalCost = stats.reduce((sum, s) => sum + s.totalCost, 0);
        const avgRating =
            stats.filter((s) => s.avgRating !== null).length > 0
                ? stats.reduce((sum, s) => sum + (s.avgRating ?? 0), 0) /
                stats.filter((s) => s.avgRating !== null).length
                : null;

        // Find most used model
        const mostUsedModel = stats.length > 0
            ? stats.reduce(
                (prev, current) => (current.totalMessages > prev.totalMessages ? current : prev),
                stats[0]!
            )
            : null;

        // Find best rated model (with at least 5 messages)
        const qualifiedModels = stats.filter((s) => s.totalMessages >= 5 && s.avgRating !== null);
        const bestRatedModel =
            qualifiedModels.length > 0
                ? qualifiedModels.reduce((prev, current) =>
                    (current.avgRating ?? 0) > (prev.avgRating ?? 0) ? current : prev
                )
                : null;

        // Find most cost-effective model (lowest cost per message with at least 5 messages)
        const modelsWithCost = stats.filter((s) => s.totalMessages >= 5 && s.totalCost > 0);
        const mostCostEffective =
            modelsWithCost.length > 0
                ? modelsWithCost.reduce((prev, current) => {
                    const prevCostPerMsg = prev.totalCost / prev.totalMessages;
                    const currentCostPerMsg = current.totalCost / current.totalMessages;
                    return currentCostPerMsg < prevCostPerMsg ? current : prev;
                })
                : null;

        // Find fastest model by tokens/sec (requires avgTokens and avgResponseTime with at least 5 messages)
        const modelsWithSpeed = stats.filter(
            (s) =>
                s.totalMessages >= 5 &&
                s.avgTokens !== null &&
                s.avgTokens !== undefined &&
                s.avgResponseTime !== null &&
                s.avgResponseTime !== undefined &&
                s.avgResponseTime > 0
        );

        const fastestModel =
            modelsWithSpeed.length > 0
                ? modelsWithSpeed.reduce((prev, current) => {
                    const prevSpeed =
                        (prev.avgTokens ?? 0) /
                        (((prev.avgResponseTime ?? 0) / 1000) || 1); // tokens per second
                    const currentSpeed =
                        (current.avgTokens ?? 0) /
                        (((current.avgResponseTime ?? 0) / 1000) || 1);
                    return currentSpeed > prevSpeed ? current : prev;
                })
                : null;

        console.log(`[analytics] Generated insights: ${totalMessages} messages, $${totalCost.toFixed(2)} cost`);

        return {
            stats,
            insights: {
                totalMessages,
                totalCost,
                avgRating,
                mostUsedModel,
                bestRatedModel,
                mostCostEffective,
                fastestModel,
            },
        };
    } catch (err) {
        console.error(`[analytics] Error loading analytics for user ${userId}:`, err);
        // Return empty data on error rather than crashing
        return {
            stats: [],
            insights: {
                totalMessages: 0,
                totalCost: 0,
                avgRating: null,
                mostUsedModel: null,
                bestRatedModel: null,
                mostCostEffective: null,
            },
        };
    }
};
