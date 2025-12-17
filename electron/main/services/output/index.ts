import { ConnectorRegistry } from './ConnectorRegistry';
import { LocalFileConnector } from './connectors/LocalFileConnector';
import { SlackConnector } from './connectors/SlackConnector';
import { GoogleDocsConnector } from './connectors/GoogleDocsConnector';

export function initializeOutputSystem() {
    const registry = ConnectorRegistry.getInstance();

    // Register Connectors
    registry.register(new LocalFileConnector());
    registry.register(new SlackConnector());
    registry.register(new GoogleDocsConnector());

    console.log('[OutputSystem] Initialized and connectors registered');
}

export { OutputTaskRunner } from './OutputTaskRunner';
