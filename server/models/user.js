const mongoose = require('mongoose');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const bcrypt = require('bcryptjs');

var UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        unique: true, // mongodb makes sure that every email is unique
        validate: {
            validator: validator.isEmail,
            message: '{VALUE} is not a valid email'
        }
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    tokens: [{
        access: {
            type: String,
            required: true
        },
        token: {
            type: String,
            required: true
        }
    }]
});

UserSchema.methods.toJSON = function () {
    var user = this;
    var userObject = user.toObject();

    return _.pick(userObject, ['_id', 'email']);
};

// add new method 'generateAuthToken' to mongoose schema object
UserSchema.methods.generateAuthToken = function () {
    // we have to use regular function () syntax to be able to reference the "this" keyword. Arrow-functions () => dont bind the "this" keyword so its more difficult to get the instance
    var user = this;
    var access = 'auth';
    // generate token for user
    var token = jwt.sign({ // first param object is the payload, which can be read by everyone
        _id: user._id.toHexString(), 
        access
    }, process.env.JWT_SECRET) // last parameter is our secret aka salt.
    .toString();

    // Add the token to the user instance
    user.tokens = user.tokens.concat([{access, token}]);

    return user.save().then(() => {
        return token;
    });
};

// add new instance method
UserSchema.methods.removeToken = function (token) {
    var user = this;

    return user.update({
        $pull: { // remove some properties
            tokens: {token}
        }
    });
};

// add static method to User class
UserSchema.statics.findByToken = function (token) {
    var User = this;
    var decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        // return new Promise((resolve, reject) => {
        //     reject();
        // });
        return Promise.reject();
    }

    return User.findOne({
        '_id': decoded._id,
        'tokens.token': token, // nested property search must be in quotes because of the dot
        'tokens.access': 'auth'
    });
};

UserSchema.statics.findByCredentials = function (email, password) {
    var User = this;

    return User.findOne({email}).then((user) => {
        if (!user) {
            return Promise.reject();
        }

        return new Promise((resolve, reject) => {
            // use bcrypt.compare to compare password and user.password
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                    resolve(user);
                } else {
                    reject();
                }
            });
        });
    })
};

// mongoose middleware, similar to server middleware
UserSchema.pre('save', function (next) {
    var user = this;

    if (user.isModified('password')){
        bcrypt.genSalt(10, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            });
        });
        
    } else {
        next();
    }
});

var User = mongoose.model('User', UserSchema);

module.exports = {User};