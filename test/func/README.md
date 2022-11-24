# Steps to run end-to-end functional tests

- Make sure you are in `test/func` directory
- Run the command `docker compose build`
- Run the command `docker compose --profile debug up` (wait till all the services are up)
- Open TTK UI at [localhost:6060](http://localhost:6060) in a browser. If TTK UI does not open, give it some more time to make sure all the services are up and running.
- Go to Test Runner, Click on Collections Manager and choose `mvp-bulk.json` in `ttk-testcases` folder
- There are different test cases. If you want to run individual test case, click on Edit for that test case and click on the Send button
- If you want to run all the test cases, there is a *Run* button in Red color at the top right of the page that you can click and run all the test cases

# Steps to run end-to-end functional tests with CLI
- Make sure you are in `test/func` directory
- Run the command `docker compose build`
- Run the command `docker compose up` (wait till all the services are up)
- Wait for some time to get all the services running
- Execute the following command in a separate terminal from `test/func` folder to run the test cases using CLI
    ```
    docker-compose -f ./ttk-tests-docker-compose.yml up
    ```
- You should get the html report in test/func/reports folder
- For cleanup, execute the following commands
    ```
    docker-compose -f ./ttk-tests-docker-compose.yml down
    docker compose down
    ```