import { OutputConnector } from './OutputConnector';
import { OutputTaskConfig } from '@core/types/database';

export class ConnectorRegistry {
    private static instance: ConnectorRegistry;
    private connectors: Map<string, OutputConnector> = new Map();

    private constructor() {}

    public static getInstance(): ConnectorRegistry {
        if (!ConnectorRegistry.instance) {
            ConnectorRegistry.instance = new ConnectorRegistry();
        }
        return ConnectorRegistry.instance;
    }

    public register(connector: OutputConnector): void {
        if (this.connectors.has(connector.id)) {
            console.warn(`Connector ${connector.id} is already registered. Overwriting.`);
        }
        this.connectors.set(connector.id, connector);
        console.log(`[ConnectorRegistry] Registered connector: ${connector.id}`);
    }

    public get(id: string): OutputConnector | undefined {
        return this.connectors.get(id);
    }

    public getForConfig(config: OutputTaskConfig): OutputConnector | undefined {
        // Map config destination to connector ID
        switch (config.destination) {
            case 'local_file':
                return this.get('local_file');
            case 'slack':
                return this.get('slack');
            case 'google_docs':
                return this.get('google_docs');
            default:
                return undefined;
        }
    }
}
