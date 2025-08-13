"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initGoogleStrategy = initGoogleStrategy;
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const prismaClient_1 = __importDefault(require("../../prismaClient"));
function initGoogleStrategy() {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const user = await prismaClient_1.default.member.upsert({
                where: { email: profile.emails?.[0].value ?? '' },
                update: {},
                create: {
                    email: profile.emails?.[0].value ?? '',
                    roleLog: [],
                },
            });
            return done(null, user);
        }
        catch (err) {
            return done(err);
        }
    }));
    passport_1.default.serializeUser((user, done) => done(null, user.id));
    passport_1.default.deserializeUser(async (id, done) => {
        const user = await prismaClient_1.default.member.findUnique({ where: { id } });
        done(null, user);
    });
}
