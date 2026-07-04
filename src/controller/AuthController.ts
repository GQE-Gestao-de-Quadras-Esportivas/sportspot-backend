import { DataSource } from "typeorm";
import { AuthUsers } from "../entities/AuthUsers.js";
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { UserDetails } from "../entities/UserDetails.js";

export class AuthController {
    constructor(private dataSource: DataSource) {}

    register = async (req: Request, res: Response): Promise<Response> => {
        const { name, document, date_of_birth, phone_number, email, password, confirm_password} = req.body;
    
        if (!name || !email || !password || !confirm_password || !phone_number || !date_of_birth) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const existingUser = await queryRunner.manager.findOne(AuthUsers, { where: { email }});
            if (existingUser) {
                return res.status(400).json({ message: 'Este e-mail já está cadastrado.' });
            }

            const passwordConfirm = password === confirm_password;
            if (!passwordConfirm) {
                throw new Error('As senhas devem ser idênticas.')
            }
            const passwordHash = await bcrypt.hash(password, 10);

            const newAuthUser = queryRunner.manager.create(AuthUsers, {
                email,
                password_hash: passwordHash
            });

            const savedAuthUser = await queryRunner.manager.save(AuthUsers, newAuthUser);

            const newUserDetail = queryRunner.manager.create(UserDetails, {
                id: savedAuthUser.id,
                document,
                phone_number,
                date_of_birth: new Date(date_of_birth)
            });

            await queryRunner.manager.save(UserDetails, newUserDetail);

            await queryRunner.commitTransaction();

            return res.status(201).json({
                message: 'Usuário cadastrado com sucesso!',
                user: {
                    id: savedAuthUser.id,
                    email: savedAuthUser.email
                }
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error('Erro no cadastro, transação desfeita:', error);
            return res.status(500).json({ message: 'Erro interno ao realizar o cadastro.'});
        } finally {
            await queryRunner.release();
        }
    }
}