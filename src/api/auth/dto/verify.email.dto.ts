/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {IsEmail, IsNotEmpty, MaxLength, MinLength} from "class-validator";
import {Trim} from "class-sanitizer";
import {i18nApi} from "../../../core/utils/res.helpers";

export default class VerifyEmailDto {
    @IsEmail({}, {message: i18nApi.emailMustBeValid})
    @Trim()
    email: string;

    @IsNotEmpty()
    @Trim()
    @MinLength(6)
    @MaxLength(6)
    code: string;
}
