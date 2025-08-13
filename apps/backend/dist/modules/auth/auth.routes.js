"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
exports.authRouter = (0, express_1.Router)();
exports.authRouter.get('/google', passport_1.default.authenticate('google', { scope: ['email', 'profile'] }));
exports.authRouter.get('/google/callback', passport_1.default.authenticate('google', { failureRedirect: '/login' }), (_, res) => res.redirect('/'));
exports.authRouter.get('/logout', (req, res) => {
    req.logout(() => { });
    res.redirect('/login');
});
