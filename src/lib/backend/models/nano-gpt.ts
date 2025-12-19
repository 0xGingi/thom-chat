import { ResultAsync } from 'neverthrow';

export interface NanoGPTModel {
    id: string;
    name: string;
    created: number;
    description: string;
    // Keeping these compatible with OpenRouter interface if needed, but making them optional
    pricing?: {
        prompt: string;
        completion: string;
        image: string;
        request: string;
    };
    context_length?: number;
    architecture?: {
        input_modalities: string[];
        output_modalities: string[];
        tokenizer: string;
    };
}

export function getNanoGPTModels() {
    return ResultAsync.fromPromise(
        (async () => {
            const [textModelsRes, imageModelsRes] = await Promise.all([
                fetch('https://nano-gpt.com/api/v1/models'),
                fetch('https://nano-gpt.com/api/models/image')
            ]);

            if (!textModelsRes.ok) {
                throw new Error(`Failed to fetch text models: ${textModelsRes.statusText}`);
            }

            const { data: textData } = await textModelsRes.json();
            const textModels = Array.isArray(textData) ? textData.map((m: any) => ({
                id: m.id,
                name: m.id,
                created: m.created || Date.now(),
                description: '',
                architecture: {
                    input_modalities: ['text'],
                    output_modalities: ['text'],
                    tokenizer: 'unknown',
                },
            })) : [];

            let imageModels: NanoGPTModel[] = [];
            if (imageModelsRes.ok) {
                const imageData = await imageModelsRes.json();
                if (imageData.models && imageData.models.image) {
                    imageModels = Object.entries(imageData.models.image).map(([id, m]: [string, any]) => ({
                        id: id,
                        name: m.name || id,
                        created: m.dateAdded ? new Date(m.dateAdded).getTime() : Date.now(),
                        description: m.description || '',
                        architecture: {
                            input_modalities: ['text'],
                            output_modalities: ['image'],
                            tokenizer: 'unknown',
                        },
                        pricing: {
                            prompt: '0',
                            completion: '0',
                            image: JSON.stringify(m.cost) || '0',
                            request: '0'
                        }
                    }));
                }
            }

            return [...textModels, ...imageModels] as NanoGPTModel[];
        })(),
        (e) => `[nano-gpt] Failed to fetch models: ${e}`
    );
}
