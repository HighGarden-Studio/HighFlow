import type { Task } from '../../../core/types/database';
import type { InputProvider } from './InputProvider';
import { UserInputProvider } from './providers/UserInputProvider';
import { LocalFileProvider } from './providers/LocalFileProvider';
import { RemoteResourceProvider } from './providers/RemoteResourceProvider';

export class InputProviderManager {
    private static instance: InputProviderManager;
    private providers: InputProvider[] = [];

    private constructor() {
        // Register default providers
        this.providers.push(new UserInputProvider());
        this.providers.push(new LocalFileProvider());
        this.providers.push(new RemoteResourceProvider());
    }

    public static getInstance(): InputProviderManager {
        if (!InputProviderManager.instance) {
            InputProviderManager.instance = new InputProviderManager();
        }
        return InputProviderManager.instance;
    }

    public getProviderForTask(task: Task): InputProvider | undefined {
        return this.providers.find((p) => p.canHandle(task));
    }

    // Allow registering custom providers (plugins)
    public registerProvider(provider: InputProvider) {
        this.providers.push(provider);
    }
}
