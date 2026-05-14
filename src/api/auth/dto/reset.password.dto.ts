/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {IsEmail, IsNotEmpty, IsNumberString, MaxLength, MinLength} from "class-validator";
// import CommonDto from "../../../core/common/common.dto";

export default class ResetPasswordDto   {



    @IsEmail( {},{message:"Email is required and must be email format"})
    @MaxLength(200)
    email: string;

    @IsNotEmpty()
    newPassword: string;

    @IsNotEmpty()
    @IsNumberString()
    @MinLength(6)
    @MaxLength(6)
    code: string;


}