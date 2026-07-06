import * as express from 'express';

declare global {
    namespace Express {
        interface Request {
            // Aqui você injeta o que o seu middleware JWT vai extrair do token
            user: {
                id: string;
            };
        }
    }
}