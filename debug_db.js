// Quick DB debug script
const checkDB = async () => {
  try {
    const response = await fetch('https://perspectivestack-frontend.marcelbutucea.workers.dev/api/articles');
    const data = await response.json();
    console.log('Database check:', data);
  } catch (error) {
    console.error('Error:', error);
  }
};

checkDB();