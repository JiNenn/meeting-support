"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cookie_session_1 = __importDefault(require("cookie-session"));
const passport_1 = __importDefault(require("passport"));
const google_strategy_1 = require("./modules/auth/google.strategy");
const auth_routes_1 = require("./modules/auth/auth.routes");
const app = (0, express_1.default)();
(0, google_strategy_1.initGoogleStrategy)();
app.use((0, cookie_session_1.default)({
    name: 'session',
    keys: [process.env.SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000,
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
app.use('/api/auth', auth_routes_1.authRouter);
app.listen(4000, () => console.log('Backend listening on :4000'));
