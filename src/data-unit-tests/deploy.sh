gcloud functions deploy  data_unit_test2 \
    --source ../cloud_functions/data_validation \
    --entry-point main \
    --project $PROJECT \
    --region europe-west2 \
    --env-vars-file cloud_functions/data_validation/env.yaml \
    --runtime python310 \
    --memory 512MB \
    --trigger-resource $BUCKET \
    --trigger-event google.storage.object.finalize
