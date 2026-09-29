import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import medicineRoutes from './routes/medicines';
import categoryRoutes from './routes/categories';
import batchRoutes from './routes/batches';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/v1/medicines', medicineRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/batches', batchRoutes);

app.get('/', (req, res) => {
  res.send('PharmaSense API is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
