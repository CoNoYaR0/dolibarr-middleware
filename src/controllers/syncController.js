import syncService from '../services/syncService.js';

async function manualSync(request, reply) {
  try {
    syncService.runInitialSync();
    reply.code(202).send({ message: 'Sync process started in the background.' });
  } catch (error) {
    request.log.error({ err: error }, 'Error starting manual sync');
    reply.code(500).send({ error: 'Failed to start sync process', message: error.message });
  }
}

export default {
  manualSync,
};
