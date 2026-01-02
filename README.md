# Dhan Option Chain Project

This project is designed to interact with the Dhan API to fetch option chain data. It is structured to separate concerns, making it easier to maintain and extend.

## Project Structure

- **src/**: Contains the source code for the application.
  - **api/**: Contains the API-related code.
    - **dhan/**: Contains the Dhan API client and related functionalities.
  - **controllers/**: Contains the controller logic for handling requests.
  - **routes/**: Defines the routes for the application.
  - **services/**: Contains service layer code to coordinate between controllers and API clients.
  - **config/**: Configuration settings for the application.
  - **utils/**: Utility functions for HTTP requests.
- **tests/**: Contains unit tests for the application.
- **.env.example**: Example environment variables needed for the project.
- **package.json**: npm configuration file.
- **tsconfig.json**: TypeScript configuration file.
- **jest.config.js**: Jest configuration file.

## Setup Instructions

1. **Clone the repository**:
   ```
   git clone <repository-url>
   cd dhan-optionchain-project
   ```

2. **Install dependencies**:
   ```
   npm install
   ```

3. **Set up environment variables**:
   Copy the `.env.example` file to `.env` and fill in the required values:
   ```
   cp .env.example .env
   ```

4. **Run the application**:
   ```
   npm start
   ```

5. **Run tests**:
   ```
   npm test
   ```

## Usage

To fetch the option chain data, make a request to the appropriate route defined in the application. The application will handle the request and return the option chain data from the Dhan API.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License.