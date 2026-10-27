import { validateRequest } from './middleware/validateRequest.js';
import { z } from 'zod';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Query is required").max(100),
  limit: z.coerce.number().int().positive().max(50).optional().default(10),
});

const validate = validateRequest(searchQuerySchema, 'query');

const mockReq = { query: { q: 'HGUSD', limit: '5' }, body: {} };
const mockRes = { 
  status: (code) => ({ json: (data) => console.log('Status:', code, 'Data:', data) }),
};
const mockNext = () => console.log('next called');

await validate(mockReq, mockRes, mockNext);
console.log('After validation, req.query:', mockReq.query);