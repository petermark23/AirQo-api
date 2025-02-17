const constants = require("@config/constants");
const NetworkSchema = require("@models/Network");
const UserSchema = require("@models/User");
const { getModelByTenant } = require("@config/dbConnection");
const { logElement, logText, logObject } = require("./log");
const generateFilter = require("./generate-filter");
const httpStatus = require("http-status");
const companyEmailValidator = require("company-email-validator");
const isEmpty = require("is-empty");
const mongoose = require("mongoose").set("debug", true);
const ObjectId = mongoose.Types.ObjectId;
const log4js = require("log4js");
const logger = log4js.getLogger(`${constants.ENVIRONMENT} -- network-util`);

const NetworkModel = (tenant) => {
  try {
    const networks = mongoose.model("networks");
    return networks;
  } catch (error) {
    const networks = getModelByTenant(tenant, "network", NetworkSchema);
    return networks;
  }
};

const UserModel = (tenant) => {
  try {
    const users = mongoose.model("users");
    return users;
  } catch (error) {
    const users = getModelByTenant(tenant, "user", UserSchema);
    return users;
  }
};

const createNetwork = {
  getNetworkFromEmail: async (request) => {
    try {
      const responseFromExtractOneNetwork =
        createNetwork.extractOneAcronym(request);

      logObject("responseFromExtractOneNetwork", responseFromExtractOneNetwork);

      if (responseFromExtractOneNetwork.success === true) {
        const { tenant } = request.query;
        let filter = {};
        const skip = 0;
        const limit = 1;

        let modifiedRequest = Object.assign({}, request);
        modifiedRequest["query"] = {};
        modifiedRequest["query"]["net_acronym"] =
          responseFromExtractOneNetwork.data;

        const responseFromGenerateFilter =
          generateFilter.networks(modifiedRequest);

        logObject("responseFromGenerateFilter", responseFromGenerateFilter);

        if (responseFromGenerateFilter.success === true) {
          filter = responseFromGenerateFilter.data;
          logObject("filter", filter);
        } else if (responseFromGenerateFilter.success === false) {
          return responseFromGenerateFilter;
        }

        const responseFromListNetworks = await NetworkModel(tenant).list({
          filter,
          limit,
          skip,
        });

        if (responseFromListNetworks.success === true) {
          const data = responseFromListNetworks.data;
          const storedNetwork = data[0]
            ? data[0].net_name || data[0].net_acronym
            : "";
          return {
            success: true,
            data: storedNetwork,
            message: data[0]
              ? "successfully retrieved the network"
              : "No network exists for this operation",
            status: httpStatus.OK,
          };
        } else if (responseFromListNetworks.success === false) {
          return responseFromListNetworks;
        }
      } else if (responseFromExtractOneNetwork.success === false) {
        return responseFromExtractOneNetwork;
      }
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },
  extractOneAcronym: (request) => {
    try {
      const { net_email } = request.body;
      let segments = [];
      let network = "";

      if (net_email) {
        let isCompanyEmail = companyEmailValidator.isCompanyEmail(net_email);

        if (isCompanyEmail) {
          segments = net_email.split("@").filter((segment) => segment);
          network = segments[1].split(".")[0];
        } else if (!isCompanyEmail) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: {
              message: "You need a company email for this operation",
            },
            status: httpStatus.BAD_REQUEST,
          };
        }
      }

      return {
        success: true,
        data: network,
        status: httpStatus.OK,
        message: "successfully removed the file extension",
      };
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        status: httpStatus.INTERNAL_SERVER_ERROR,
        errors: {
          message: error.message,
        },
      };
    }
  },

  sanitizeName: (name) => {
    try {
      let nameWithoutWhiteSpaces = name.replace(/\s/g, "");
      let shortenedName = nameWithoutWhiteSpaces.substring(0, 15);
      let trimmedName = shortenedName.trim();
      return trimmedName.toLowerCase();
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      logElement("the sanitise name error", error.message);
    }
  },
  create: async (request) => {
    try {
      const { body, query } = request;
      const { tenant } = query;

      let modifiedBody = Object.assign({}, body);

      const responseFromExtractNetworkName =
        createNetwork.extractOneAcronym(request);

      logObject(
        "responseFromExtractNetworkName",
        responseFromExtractNetworkName
      );

      if (responseFromExtractNetworkName.success === true) {
        modifiedBody["net_name"] = responseFromExtractNetworkName.data;
        modifiedBody["net_acronym"] = responseFromExtractNetworkName.data;
      } else if (responseFromExtractNetworkName.success === false) {
        return responseFromExtractNetworkName;
      }

      const networkObject = await NetworkModel(tenant.toLowerCase())
        .findOne({ net_website: modifiedBody.net_website })
        .lean();
      if (!isEmpty(networkObject)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Network for ${modifiedBody.net_website} already exists`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const user = request.user;
      logObject("the user making the request", user);
      if (!isEmpty(user)) {
        modifiedBody.net_manager = ObjectId(user._id);
        modifiedBody.net_manager_username = user.email;
        modifiedBody.net_manager_firstname = user.firstName;
        modifiedBody.net_manager_lastname = user.lastName;
      } else if (isEmpty(user)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "creator's details are not provided" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      /**
       * this person needs to be added to be assigned to this network?
       * this user also needs to be assigned a rolem, super ADMIN
       */

      logObject("modifiedBody", modifiedBody);
      const responseFromRegisterNetwork = await NetworkModel(tenant).register(
        modifiedBody
      );

      logObject("responseFromRegisterNetwork", responseFromRegisterNetwork);

      if (responseFromRegisterNetwork.success === true) {
        return responseFromRegisterNetwork;
      } else if (responseFromRegisterNetwork.success === false) {
        return responseFromRegisterNetwork;
      }
    } catch (err) {
      return {
        success: false,
        message: "network util server errors",
        errors: { message: err.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },

  assignUsers: async (request) => {
    try {
      const { net_id } = request.params;
      const { user_ids } = request.body;
      const { tenant } = request.query;

      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: `Invalid network ID ${net_id}` },
          status: httpStatus.BAD_REQUEST,
        };
      }

      for (const user_id of user_ids) {
        const user = await UserModel(tenant).findById(ObjectId(user_id));

        if (!user) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: {
              message: `Invalid User ID ${user_id}, please crosscheck`,
            },
            status: httpStatus.BAD_REQUEST,
          };
        }

        if (network.net_users.includes(user_id)) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: {
              message: `User ${user_id} is already assigned to the network`,
            },
            status: httpStatus.BAD_REQUEST,
          };
        }

        if (user.networks.includes(net_id)) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: {
              message: `Network ${net_id} is already assigned to the user ${user_id}`,
            },
            status: httpStatus.BAD_REQUEST,
          };
        }
      }

      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { $addToSet: { net_users: user_ids } },
        { new: true }
      );

      if (isEmpty(updatedNetwork)) {
        return {
          success: false,
          message: "Bad Request Error",
          status: httpStatus.BAD_REQUEST,
          errors: { message: "Network not found" },
        };
      }

      const totalUsers = user_ids.length;
      const { nModified, n } = await UserModel(tenant).updateMany(
        { _id: { $in: user_ids } },
        { $addToSet: { networks: net_id } }
      );

      const notFoundCount = totalUsers - nModified;
      if (nModified === 0) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "No matching User found in the system" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (notFoundCount > 0) {
        return {
          success: true,
          message: `Operation partially successful somce ${notFoundCount} of the provided users were not found in the system`,
          status: httpStatus.OK,
        };
      }

      return {
        success: true,
        message: "successfully attached all the provided users to the Network",
        status: httpStatus.OK,
        data: updatedNetwork,
      };
    } catch (error) {
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },

  assignOneUser: async (request) => {
    try {
      const { net_id, user_id } = request.params;
      const { tenant } = request.query;

      const userExists = await UserModel(tenant).exists({ _id: user_id });
      const networkExists = await NetworkModel(tenant).exists({ _id: net_id });

      if (!userExists || !networkExists) {
        return {
          success: false,
          message: "User or Network not found",
          status: httpStatus.BAD_REQUEST,
          errors: { message: "User or Network not found" },
        };
      }

      const network = await NetworkModel(tenant).findById(net_id);
      const user = await UserModel(tenant).findById(user_id);

      if (network.net_users.includes(user_id)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "User already assigned to Network" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (user.networks.includes(net_id)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network already assigned to User" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { $addToSet: { net_users: user_id } },
        { new: true }
      );
      const updatedUser = await UserModel(tenant).findByIdAndUpdate(
        user_id,
        { $addToSet: { networks: net_id } },
        { new: true }
      );

      return {
        success: true,
        message: "User attached to Network",
        data: { updatedNetwork, updatedUser },
        status: httpStatus.OK,
      };
    } catch (error) {
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },

  unAssignUser: async (request) => {
    try {
      const { net_id, user_id } = request.params;
      const { tenant } = request.query;

      // Check if the network exists
      const network = await NetworkModel(tenant).findById(net_id);
      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      // Check if the user exists
      const user = await UserModel(tenant).findById(user_id);
      if (!user) {
        return {
          success: false,
          status: httpStatus.BAD_REQUEST,
          message: "Bad Request Error",
          errors: { message: "User not found" },
        };
      }

      // Check if the user is assigned to the network
      const isUserInNetwork = network.net_users.some(
        (userId) => userId.toString() === user_id.toString()
      );
      if (!isUserInNetwork) {
        return {
          success: false,
          message: "Bad Request Error",
          status: httpStatus.BAD_REQUEST,
          errors: {
            message: `User ${user_id.toString()} is not assigned to the network`,
          },
        };
      }

      // Check if the network is part of the user's networks
      const isNetworkInUser = user.networks.some(
        (networkId) => networkId.toString() === net_id.toString()
      );
      if (!isNetworkInUser) {
        return {
          success: false,
          message: "Bad Request Error",
          status: httpStatus.BAD_REQUEST,
          errors: {
            message: `Network ${net_id.toString()} is not part of the user's networks`,
          },
        };
      }

      // Remove the user from the network
      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { $pull: { net_users: user_id } },
        { new: true }
      );

      // Remove the network from the user
      const updatedUser = await UserModel(tenant).findByIdAndUpdate(
        user_id,
        { $pull: { networks: net_id } },
        { new: true }
      );

      return {
        success: true,
        message: "Successfully unassigned User from the Network",
        data: { updatedNetwork, updatedUser },
        status: httpStatus.OK,
      };
    } catch (error) {
      logObject("error", error);
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  unAssignManyUsers: async (request) => {
    try {
      const { user_ids } = request.body;
      const { net_id } = request.params;
      const { tenant } = request.query;

      // Check if network exists
      const network = await NetworkModel(tenant).findById(net_id);
      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      //check of all these provided users actually do exist?
      const existingUsers = await UserModel(tenant).find(
        { _id: { $in: user_ids } },
        "_id"
      );

      if (existingUsers.length !== user_ids.length) {
        const nonExistentUsers = user_ids.filter(
          (user_id) => !existingUsers.find((user) => user._id.equals(user_id))
        );

        return {
          success: false,
          message: `Bad Request Error`,
          errors: {
            message: `The following users do not exist: ${nonExistentUsers}`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      // Check if all user_ids exist in the network's net_users array

      const networkUsers = await NetworkModel(tenant).findOne({
        _id: net_id,
        net_users: { $all: user_ids },
      });
      if (isEmpty(networkUsers)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message:
              "One or more of the provided users are not part of the network",
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      //check if all the provided user_ids have the network_id in their network's field?

      const users = await UserModel(tenant).find({
        _id: { $in: user_ids },
        networks: { $all: [net_id] },
      });

      if (users.length !== user_ids.length) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Some of the provided User IDs do not have this network ${net_id} as part of their network`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      // Remove the user_ids from the network's net_users array
      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { $pullAll: { net_users: user_ids } },
        { new: true }
      );

      //remove the net_id from all the user's network field

      try {
        const totalUsers = user_ids.length;
        const { nModified, n } = await UserModel(tenant).updateMany(
          { _id: { $in: user_ids }, networks: { $in: [net_id] } },
          { $pull: { networks: net_id } },
          { multi: true }
        );

        const notFoundCount = totalUsers - nModified;
        if (nModified === 0) {
          return {
            success: false,
            message: "Bad Request Error",
            errors: { message: "No matching User found in the system" },
            status: httpStatus.BAD_REQUEST,
          };
        }

        if (notFoundCount > 0) {
          return {
            success: true,
            message: `Operation partially successful since ${notFoundCount} of the provided users were not found in the system`,
            status: httpStatus.OK,
          };
        }
      } catch (error) {
        logger.error(`Internal Server Error ${error.message}`);
        return {
          success: false,
          message: "Internal Server Error",
          status: httpStatus.INTERNAL_SERVER_ERROR,
          errors: { message: error.message },
        };
      }

      return {
        success: true,
        message: "successfully unassigned all the provided  users",
        status: httpStatus.OK,
        data: updatedNetwork,
      };
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },
  setManager: async (request) => {
    try {
      const { net_id, user_id } = request.params;
      const { tenant } = request.query;

      const user = await UserModel(tenant).findById(user_id).lean();
      const network = await NetworkModel(tenant).findById(net_id).lean();

      if (isEmpty(user)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "User not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (isEmpty(network)) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: { message: "Network not found" },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (
        network.net_manager &&
        network.net_manager.toString() === user_id.toString()
      ) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `User ${user_id.toString()} is already the network manager`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (
        !network.net_users
          .map((id) => id.toString())
          .includes(user_id.toString())
      ) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `User ${user_id.toString()} is not assigned to the network, not authorized to manage this network`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      if (
        !user.networks.map((id) => id.toString()).includes(net_id.toString())
      ) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Network ${net_id.toString()} is not part of User's networks, not authorized to manage this network`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { net_manager: user_id },
        { new: true }
      );

      if (!isEmpty(updatedNetwork)) {
        return {
          success: true,
          message: "User assigned to Network successfully",
          status: httpStatus.OK,
          data: updatedNetwork,
        };
      } else {
        return {
          success: false,
          message: "Bad Request",
          errors: { message: "No network record was updated" },
          status: httpStatus.BAD_REQUEST,
        };
      }
    } catch (error) {
      logObject("error", error);
      logger.error(`Internal Server Error -- ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
        status: httpStatus.INTERNAL_SERVER_ERROR,
      };
    }
  },

  update: async (request) => {
    try {
      const { body, query, params } = request;
      const { action } = request;
      const { tenant } = query;
      let update = Object.assign({}, body);
      logElement("action", action);
      update["action"] = action;

      let filter = {};
      const responseFromGeneratefilter = generateFilter.networks(request);

      if (responseFromGeneratefilter.success === true) {
        filter = responseFromGeneratefilter.data;
      } else if (responseFromGeneratefilter.success === false) {
        return responseFromGeneratefilter;
      }

      if (!isEmpty(params.user_id)) {
        /**
         * we also need to update the Users?
         */
        const usersArray = params.user_id.toString().split(",");
        const modifiedUsersArray = usersArray.map((user_id) => {
          return ObjectId(user_id);
        });
        update.net_users = modifiedUsersArray;
      } else if (!isEmpty(update.user_ids)) {
        /**
         * we also need to update the Users?
         */
        const usersArray = update.user_ids.toString().split(",");
        const modifiedUsersArray = usersArray.map((user_id) => {
          return ObjectId(user_id);
        });
        update.net_users = modifiedUsersArray;
      }

      if (!isEmpty(action)) {
        if (action === "setManager") {
          /**
           * We could also first check if they belong to the network?
           */
          update["$addToSet"] = {};
          update["$addToSet"]["net_users"] = {};
          update["$addToSet"]["net_users"]["$each"] = update.net_users;
          update["net_manager"] = update.net_users[0];
          delete update.net_users;
        }
      }

      const responseFromModifyNetwork = await NetworkModel(tenant).modify({
        update,
        filter,
      });

      if (responseFromModifyNetwork.success === true) {
        return responseFromModifyNetwork;
      } else if (responseFromModifyNetwork.success === false) {
        return responseFromModifyNetwork;
      }
    } catch (error) {
      logObject("error", error);
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },
  delete: async (request) => {
    try {
      logText("the delete operation.....");
      const { query } = request;
      const { tenant } = query;
      let filter = {};

      const responseFromGenerateFilter = generateFilter.networks(request);

      logObject("responseFromGenerateFilter", responseFromGenerateFilter);

      if (responseFromGenerateFilter.success === true) {
        filter = responseFromGenerateFilter.data;
      } else if (responseFromGenerateFilter.success === false) {
        return responseFromGenerateFilter;
      }

      logObject("the filter", filter);

      const responseFromRemoveNetwork = await NetworkModel(tenant).remove({
        filter,
      });

      logObject("responseFromRemoveNetwork", responseFromRemoveNetwork);

      if (responseFromRemoveNetwork.success === true) {
        return responseFromRemoveNetwork;
      } else if (responseFromRemoveNetwork.success === false) {
        return responseFromRemoveNetwork;
      }
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        message: "Internal Server Error",
        status: httpStatus.INTERNAL_SERVER_ERROR,
        errors: { message: error.message },
        success: false,
      };
    }
  },
  list: async (request) => {
    try {
      let { skip, limit, tenant } = request.query;
      let filter = {};

      const responseFromGenerateFilter = generateFilter.networks(request);

      if (responseFromGenerateFilter.success === true) {
        filter = responseFromGenerateFilter.data;
        logObject("filter", filter);
      } else if (responseFromGenerateFilter.success === false) {
        return responseFromGenerateFilter;
      }

      const responseFromListNetworks = await NetworkModel(tenant).list({
        filter,
        limit,
        skip,
      });

      if (responseFromListNetworks.success === true) {
        return responseFromListNetworks;
      } else if (responseFromListNetworks.success === false) {
        return responseFromListNetworks;
      }
    } catch (error) {
      logElement("internal server error", error.message);
      logObject("error", error);
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },

  refresh: async (request) => {
    try {
      const { tenant } = request.query;
      const { net_id } = request.params;

      /**
       * does this network ID even exist?
       */
      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Invalid network ID ${net_id}, please crosscheck`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      /**
       ** Find all Users which have this networkID
       * a.k.a list assigned users...
       */

      const responseFromListAssignedUsers = await UserModel(tenant)
        .find({ networks: { $in: [net_id.toString()] } })
        .lean();

      // logObject("responseFromListAssignedUsers", responseFromListAssignedUsers);

      // return {
      //   success: true,
      //   status: httpStatus.OK,
      //   message: "success",
      // };

      const net_users = responseFromListAssignedUsers.map((element) => {
        return element._id;
      });

      /**
       * Do a mass update of the network's net_users using the net_users obtained from the list.
       *  ---- while doing this mass update, ensure that we do not introduce any duplicates
       */

      const updatedNetwork = await NetworkModel(tenant).findByIdAndUpdate(
        net_id,
        { $addToSet: { net_users } },
        { new: true }
      );

      if (isEmpty(updatedNetwork)) {
        return {
          success: false,
          message: "Bad Request Error",
          status: httpStatus.BAD_REQUEST,
          errors: { message: "Network not found" },
        };
      }

      return {
        success: true,
        message: `Successfully refreshed the network ${net_id.toString()} users' details`,
        status: httpStatus.OK,
        data: updatedNetwork,
      };
    } catch (error) {
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        message: "Bad Request Errors",
        errors: { message: error.message },
      };
    }
  },

  listAvailableUsers: async (request) => {
    try {
      const { tenant } = request.query;
      const { net_id } = request.params;

      const network = await NetworkModel(tenant).findById(net_id);

      if (!network) {
        return {
          success: false,
          message: "Bad Request Error",
          errors: {
            message: `Invalid network ID ${net_id}, please crosscheck`,
          },
          status: httpStatus.BAD_REQUEST,
        };
      }

      const responseFromListAvailableUsers = await UserModel(tenant)
        .find({ networks: { $nin: [net_id.toString()] } })
        .select({
          _id: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
          createdAt: 1,
          userName: 1,
        })
        .lean();

      logObject(
        "responseFromListAvailableUsers",
        responseFromListAvailableUsers
      );

      return {
        success: true,
        message: `retrieved all available users for network ${net_id}`,
        data: responseFromListAvailableUsers,
      };
    } catch (error) {
      logElement("internal server error", error.message);
      logger.error(`Internal Server Error ${error.message}`);
      return {
        success: false,
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: "Internal Server Error",
        errors: { message: error.message },
      };
    }
  },
};

module.exports = createNetwork;
