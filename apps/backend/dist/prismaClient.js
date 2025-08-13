"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/prismaClient.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    log: ['query', 'info', 'warn', 'error'], // 開発中だけ verbose に
});
exports.default = prisma;
