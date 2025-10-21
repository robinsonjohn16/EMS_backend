import express from 'express';
import { register, login, getMe, refreshToken, logout } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', protect, register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/refresh', protect, refreshToken);
router.post('/logout', protect, logout);

export default router;