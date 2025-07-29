// Quick script to create tables via a worker

const createTables = async () => {
  const response = await fetch('https://rss-collector.marcelbutucea.workers.dev/health');
  console.log('Worker accessible:', response.ok);
  
  // We'll need to add an endpoint to our workers to execute schema updates
};

createTables();