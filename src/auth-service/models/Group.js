const mongoose = require("mongoose");
const ObjectId = mongoose.Schema.Types.ObjectId;
const { Schema } = mongoose;
const validator = require("validator");
var uniqueValidator = require("mongoose-unique-validator");
const { logObject, logElement, logText } = require("../utils/log");
const isEmpty = require("is-empty");
const { getModelByTenant } = require("../utils/multitenancy");
const HTTPStatus = require("http-status");

const GroupSchema = new Schema(
  {
    grp_title: {
      type: String,
      unique: true,
      required: [true, "grp_title is required"],
    },
    grp_status: { type: String, default: "inactive" },
    network_id: {
      type: ObjectId,
      ref: "network",
      trim: true,
      required: [true, "network_id is required"],
    },
    grp_users: [
      {
        type: ObjectId,
        ref: "user",
      },
    ],
    grp_tasks: { type: Number },
    description: { type: String, required: [true, "description is required"] },
  },
  {
    timestamps: true,
  }
);

GroupSchema.plugin(uniqueValidator, {
  message: `{VALUE} should be unique!`,
});

GroupSchema.index({ grp_title: 1 }, { unique: true });

GroupSchema.methods = {
  toJSON() {
    return {
      _id: this._id,
      grp_title: this.grp_title,
      grp_status: this.grp_status,
      grp_users: this.grp_users,
      grp_tasks: this.grp_tasks,
      description: this.description,
      network_id: this.network_id,
      createdAt: this.createdAt,
    };
  },
};

const sanitizeName = (name) => {
  try {
    let nameWithoutWhiteSpaces = name.replace(/\s/g, "");
    let shortenedName = nameWithoutWhiteSpaces.substring(0, 15);
    let trimmedName = shortenedName.trim();
    return trimmedName.toLowerCase();
  } catch (error) {
    logElement("the sanitise name error", error.message);
  }
};

GroupSchema.statics = {
  async register(args) {
    try {
      let modifiedArgs = args;
      let tenant = modifiedArgs.tenant;
      if (tenant) {
        modifiedArgs["tenant"] = sanitizeName(tenant);
      }
      let data = await this.create({
        ...modifiedArgs,
      });
      if (!isEmpty(data)) {
        return {
          success: true,
          data,
          message: "group created",
          status: HTTPStatus.OK,
        };
      } else {
        return {
          success: true,
          data,
          message: "group NOT successfully created but operation successful",
          status: HTTPStatus.NO_CONTENT,
        };
      }
    } catch (err) {
      let response = {};
      let errors = {};
      let message = "Internal Server Error";
      let status = HTTPStatus.INTERNAL_SERVER_ERROR;
      if (err.code === 11000 || err.code === 11001) {
        errors = err.keyValue;
        message = "duplicate values provided";
        status = HTTPStatus.CONFLICT;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value);
        });
      } else {
        message = "validation errors for some of the provided fields";
        status = HTTPStatus.CONFLICT;
        errors = err.errors;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value.message);
        });
      }
      return {
        errors: response,
        message,
        success: false,
        status,
      };
    }
  },
  async list({ skip = 0, limit = 5, filter = {} } = {}) {
    try {
      const response = await this.aggregate()
        .match(filter)
        .lookup({
          from: "users",
          localField: "grp_users",
          foreignField: "_id",
          as: "grp_users",
        })
        .lookup({
          from: "networks",
          localField: "network_id",
          foreignField: "_id",
          as: "network",
        })
        .sort({ createdAt: -1 })
        .project({
          _id: 1,
          grp_title: 1,
          grp_status: 1,
          grp_tasks: 1,
          description: 1,
          createdAt: 1,
          grp_users: "$grp_users",
          network: { $arrayElemAt: ["$network", 0] },
        })
        .project({
          "network.__v": 0,
          "network.createdAt": 0,
          "network.updatedAt": 0,
        })
        .project({
          "grp_users.__v": 0,
          "grp_users.notifications": 0,
          "grp_users.emailConfirmed": 0,
          "grp_users.groups": 0,
          "grp_users.locationCount": 0,
          "grp_users.group": 0,
          "grp_users.long_network": 0,
          "grp_users.privilege": 0,
          "grp_users.userName": 0,
          "grp_users.password": 0,
          "grp_users.duration": 0,
          "grp_users.createdAt": 0,
          "grp_users.updatedAt": 0,
        })
        .skip(skip ? skip : 0)
        .limit(limit ? limit : 100)
        .allowDiskUse(true);

      if (!isEmpty(response)) {
        let data = response;
        return {
          success: true,
          message: "successfully retrieved the groups",
          data,
          status: HTTPStatus.OK,
        };
      } else if (isEmpty(response)) {
        return {
          success: false,
          message: "group/s do not exist, please crosscheck",
          status: HTTPStatus.NOT_FOUND,
          data: [],
          errors: { message: "unable to retrieve groups" },
        };
      }
    } catch (err) {
      let response = {};
      let errors = {};
      let message = "Internal Server Error";
      let status = HTTPStatus.INTERNAL_SERVER_ERROR;
      if (err.code === 11000 || err.code === 11001) {
        errors = err.keyValue;
        message = "duplicate values provided";
        status = HTTPStatus.CONFLICT;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value);
        });
      } else {
        message = "validation errors for some of the provided fields";
        status = HTTPStatus.CONFLICT;
        errors = err.errors;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value.message);
        });
      }
      return {
        errors: response,
        message,
        success: false,
        status,
      };
    }
  },

  async modify({ filter = {}, update = {} } = {}) {
    try {
      let options = { new: true };
      let modifiedUpdate = update;
      modifiedUpdate["$addToSet"] = {};

      if (modifiedUpdate.tenant) {
        delete modifiedUpdate.tenant;
      }

      if (modifiedUpdate.grp_users) {
        modifiedUpdate["$addToSet"]["grp_users"] = {};
        modifiedUpdate["$addToSet"]["grp_users"]["$each"] =
          modifiedUpdate.grp_users;
        delete modifiedUpdate["grp_users"];
      }

      let updatedOrganization = await this.findOneAndUpdate(
        filter,
        modifiedUpdate,
        options
      ).exec();

      if (!isEmpty(updatedOrganization)) {
        let data = updatedOrganization._doc;
        return {
          success: true,
          message: "successfully modified the group",
          data,
          status: HTTPStatus.OK,
        };
      } else {
        return {
          success: false,
          message: "group does not exist, please crosscheck",
          status: HTTPStatus.NOT_FOUND,
          errors: "Not Found",
        };
      }
    } catch (err) {
      let response = {};
      let errors = {};
      let message = "Internal Server Error";
      let status = HTTPStatus.INTERNAL_SERVER_ERROR;
      if (err.code === 11000 || err.code === 11001) {
        errors = err.keyValue;
        message = "duplicate values provided";
        status = HTTPStatus.CONFLICT;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value);
        });
      } else {
        message = "validation errors for some of the provided fields";
        status = HTTPStatus.CONFLICT;
        errors = err.errors;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value.message);
        });
      }
      return {
        errors: response,
        message,
        success: false,
        status,
      };
    }
  },
  async remove({ filter = {} } = {}) {
    try {
      let options = {
        projection: {
          _id: 1,
          grp_title: 1,
          grp_status: 1,
          description: 1,
          createdAt: 1,
        },
      };
      let removedOrganization = await this.findOneAndRemove(
        filter,
        options
      ).exec();

      if (!isEmpty(removedOrganization)) {
        let data = removedOrganization._doc;
        return {
          success: true,
          message: "successfully removed the group",
          data,
          status: HTTPStatus.OK,
        };
      } else {
        return {
          success: false,
          message: "group does not exist, please crosscheck",
          status: HTTPStatus.NOT_FOUND,
          errors: "Not Found",
        };
      }
    } catch (err) {
      let response = {};
      let errors = {};
      let message = "Internal Server Error";
      let status = HTTPStatus.INTERNAL_SERVER_ERROR;
      if (err.code === 11000 || err.code === 11001) {
        errors = err.keyValue;
        message = "duplicate values provided";
        status = HTTPStatus.CONFLICT;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value);
        });
      } else {
        message = "validation errors for some of the provided fields";
        status = HTTPStatus.CONFLICT;
        errors = err.errors;
        Object.entries(errors).forEach(([key, value]) => {
          return (response[key] = value.message);
        });
      }
      return {
        errors: response,
        message,
        success: false,
        status,
      };
    }
  },
};

module.exports = GroupSchema;
